import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getProgramById } from "@/lib/programs";
import type { PartnerInput } from "@/lib/partner";

/**
 * Sync Partner の返事を Edge Function `sync-partner`（supabase/functions/sync-partner）に頼む。
 * 関数はログインした本人を確かめ、1日の回数（SQL 008）を数えてから AI に書かせる。会話は
 * 関数にも DB にも残らない（端末の store/usePartnerChatStore.ts にその日のぶんだけ）。
 *
 * 失敗は PartnerError。画面は code を見て決まった台詞（lib/partner-lines.ts）に替える——
 * 関数がまだ無い（デプロイ前）・ログインが切れた・通信できない、のどれでも会話は続く。
 */
const FUNCTION = "sync-partner";

/** 関数は AI の返事を 25 秒で打ち切る。中継の分を足して少し長めに。 */
const INVOKE_TIMEOUT_MS = 35_000;

export type PartnerErrorCode =
  /** 関数がまだ無い（404）・Secrets が無い・Supabase の設定が無い */
  | "not_configured"
  | "unauthorized"
  /** 形が関数と食い違っている（関数か画面のどちらかが古い） */
  | "bad_input"
  /** その日の回数（30 回）を使い切った */
  | "daily_limit"
  /** 前の1通から 2 秒たっていない */
  | "too_fast"
  /** AI に問い合わせられなかった・返事を読めなかった */
  | "upstream"
  /** 端末がオフライン */
  | "network"
  /** 返事が届かなかった（タイムアウト・中継の失敗・CORS の無い 5xx） */
  | "unreachable";

const SERVER_CODES: readonly PartnerErrorCode[] = [
  "not_configured",
  "unauthorized",
  "bad_input",
  "daily_limit",
  "too_fast",
  "upstream",
];

export class PartnerError extends Error {
  readonly code: PartnerErrorCode;
  constructor(code: PartnerErrorCode) {
    super(code);
    this.name = "PartnerError";
    this.code = code;
  }
}

export interface PartnerReply {
  /** 役のひと言（関数が整えた文）。 */
  reply: string;
  /** 勧めたプログラム（このアプリが知っている id だけ。知らない id は null に落とす）。 */
  programId: string | null;
  /** つらい気持ちへの決まった文（AI は書いていない・回数に数えない）。 */
  care: boolean;
  /** その日の残りの回数（数えなかった返事では null）。 */
  remaining: number | null;
}

function normalizeReply(data: unknown): PartnerReply | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const reply = typeof d.reply === "string" ? d.reply.trim() : "";
  if (!reply) return null;
  return {
    reply,
    programId: typeof d.programId === "string" && getProgramById(d.programId) ? d.programId : null,
    care: d.care === true,
    remaining:
      typeof d.remaining === "number" && Number.isFinite(d.remaining) ? Math.max(0, Math.floor(d.remaining)) : null,
  };
}

/** 返事を1つ頼む。 */
export async function askPartner(input: PartnerInput): Promise<PartnerReply> {
  if (!supabase) throw new PartnerError("not_configured");
  const { data, error } = await supabase.functions.invoke(FUNCTION, {
    body: input,
    timeout: INVOKE_TIMEOUT_MS,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      // 関数がまだ無い（デプロイ前）は 404。
      if (res.status === 404) throw new PartnerError("not_configured");
      let code: unknown;
      try {
        code = ((await res.json()) as { error?: unknown } | null)?.error;
      } catch {
        code = undefined;
      }
      const known = SERVER_CODES.find((c) => c === code);
      throw new PartnerError(known ?? (res.status === 401 ? "unauthorized" : "upstream"));
    }
    // 返事を読めなかった。理由はブラウザが隠すので、調べる人のためにコンソールへ残す
    // （利用者の言葉は残さない）。
    console.warn("sync-partner: no readable response", error.name, error.message);
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new PartnerError(offline ? "network" : "unreachable");
  }
  const reply = normalizeReply(data);
  if (!reply) throw new PartnerError("upstream");
  return reply;
}
