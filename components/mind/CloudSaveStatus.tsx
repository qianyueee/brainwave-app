"use client";

import { usePathname } from "next/navigation";
import { Check, CloudOff, CloudUpload, LoaderCircle, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isDesktopRoute } from "@/lib/desktop";
import {
  isCheckUploadable,
  isSaved,
  isSessionUploadable,
  markOwner,
  sessionRev,
} from "@/lib/sync/cloud-mark";
import { useMindStore } from "@/store/useMindStore";
import { useBaselineStore } from "@/store/useBaselineStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useCloudSyncStore } from "@/store/useCloudSyncStore";
import { useT, type LocalizedText } from "@/lib/i18n";

type Kind = "session" | "check";

const NOUN: Record<Kind, LocalizedText> = {
  session: { ja: "この測定", en: "this measurement" },
  check: { ja: "この記録", en: "this record" },
};

/** 英語で文頭に置くとき（"this measurement" → "This measurement"）。 */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * 1件の記録（測定セッション／10秒チェック）がアカウントに保存されたかを示す1〜2行。
 * デスクトップの測定終了ダイアログと、10秒チェックの結果（Web・デスクトップ）に置く。
 *
 * 状態は記録そのものの印（lib/sync/cloud-mark.ts）を毎回読み直して出す——送信は
 * 裏で進む（lib/sync/outbox.ts）ので、ダイアログを開いている間に「保存中…」から
 * 「保存しました」に変わる。
 *
 * 未ログインで測った記録に「ログインして保存」を出すのはデスクトップだけ：Web の
 * 10秒チェックは未ログインでも端末に残す習慣の機能で、そこは変えない。
 */
export default function CloudSaveStatus({ kind, id }: { kind: Kind; id: string }) {
  const t = useT();
  const noun = NOUN[kind];
  const session = useMindStore((s) =>
    kind === "session" ? s.sessions.find((x) => x.id === id) : undefined
  );
  const check = useBaselineStore((s) =>
    kind === "check" ? s.checks.find((x) => x.id === id) : undefined
  );
  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const account = useCloudSyncStore((s) => s.account);
  const phase = useCloudSyncStore((s) => s.phase);
  const requestClaim = useCloudSyncStore((s) => s.requestClaimOnLogin);
  const claimed = useCloudSyncStore((s) =>
    (kind === "session" ? s.claimOnLogin.sessions : s.claimOnLogin.checks).includes(id)
  );
  const assignSessions = useMindStore((s) => s.assignSessions);
  const assignChecks = useBaselineStore((s) => s.assignChecks);
  const desktop = isDesktopRoute(usePathname());

  // アカウント機能の無いビルド（Supabase 未設定）では何も言わない。
  if (!supabase) return null;
  const record = session ?? check;
  if (!record) return null;

  const uploadable = session ? isSessionUploadable(session) : isCheckUploadable(check!);
  if (!uploadable) {
    // デモ・合成データは実測と混ぜない。読めなかった測定は呼び出し側が説明している。
    if (record.source !== "demo") return null;
    return (
      <p className="text-sm text-text-muted">
        {kind === "session"
          ? t(
              "デモ・合成データの測定はアカウントに保存されません",
              "Measurements from demo or synthetic data aren't saved to your account"
            )
          : t(
              "デモ・合成データの記録はアカウントに保存されません",
              "Records from demo or synthetic data aren't saved to your account"
            )}
      </p>
    );
  }

  const mark = record.cloud;
  const rev = session ? sessionRev(session) : 0;
  const owner = markOwner(mark);

  if (mark && "localOnly" in mark) {
    return (
      <p className="text-sm text-text-muted">
        {t(
          `${noun.ja}はこの端末だけに保存しています`,
          `${capitalize(noun.en)} is saved only on this device`
        )}
      </p>
    );
  }

  if (!owner) {
    if (!desktop) return null;
    if (claimed) {
      return (
        <p className="text-sm text-text-secondary">
          {t(
            `ログインすると、${noun.ja}をアカウントに保存します`,
            `When you log in, ${noun.en} will be saved to your account`
          )}
        </p>
      );
    }
    // 測り終えてからログインした場合：宛先がまだ無いので、ここで決めてもらう。
    if (account) {
      return (
        <button
          onClick={() =>
            kind === "session" ? assignSessions([id], account.id) : assignChecks([id], account.id)
          }
          className="flex items-center justify-center gap-2 min-h-12 px-4 rounded-2xl bg-navy text-primary text-base font-bold neu-raised-sm neu-press"
        >
          <CloudUpload size={18} />
          {t(`${noun.ja}をアカウントに保存する`, `Save ${noun.en} to your account`)}
        </button>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-secondary">
          {t(
            `ログインすると、${noun.ja}をアカウントに保存して Web版で見られます`,
            `Log in to save ${noun.en} to your account and view it in the web app`
          )}
        </p>
        <button
          onClick={() => {
            requestClaim(kind, id);
            openAuthModal("login");
          }}
          className="flex items-center justify-center gap-2 min-h-12 px-4 rounded-2xl bg-navy text-primary text-base font-bold neu-raised-sm neu-press"
        >
          <LogIn size={18} />
          {t("ログインして保存", "Log in to save")}
        </button>
      </div>
    );
  }

  if (account && owner !== account.id) {
    return (
      <p className="text-sm text-text-muted">
        {t(
          `${noun.ja}は、測ったときにログインしていたアカウントに保存されます`,
          `${capitalize(noun.en)} will be saved to the account that was logged in when it was measured`
        )}
      </p>
    );
  }

  if (isSaved(mark, rev)) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-success">
        <Check size={18} strokeWidth={2.5} className="shrink-0 mt-px" />
        <span>
          {t("アカウントに保存しました", "Saved to your account")}
          {desktop && (
            <span className="block text-text-secondary">
              {t(
                "Web版の Sync Report・Sync History で見られます",
                "You can view it in Sync Report and Sync History in the web app"
              )}
            </span>
          )}
        </span>
      </p>
    );
  }

  // 宛先は決まっていて、まだ届いていない。
  if (!user) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-warning">
        <CloudOff size={18} className="shrink-0 mt-px" />
        {t(
          "インターネットにつながると、自動でアカウントに保存します",
          "It will be saved to your account automatically once you're online"
        )}
      </p>
    );
  }
  if (phase === "error") {
    return (
      <p className="flex items-start gap-1.5 text-sm text-warning">
        <CloudOff size={18} className="shrink-0 mt-px" />
        {t(
          "まだ保存できていません。通信が戻ると自動で保存します",
          "Not saved yet. It will be saved automatically when the connection is back."
        )}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-sm text-text-secondary">
      <LoaderCircle size={18} className="shrink-0 animate-spin" />
      {t("アカウントに保存しています…", "Saving to your account…")}
    </p>
  );
}
