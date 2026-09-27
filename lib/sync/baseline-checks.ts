import { supabase } from "@/lib/supabase";
import type { BaselineCheck } from "@/store/useBaselineStore";
import { PAGE_SIZE, selectAllByKey } from "./paginate";

/**
 * 10秒チェックのクラウド保存。1回1行（`user_baseline_checks`、PK は user_id + id。
 * supabase/migrations/003_account_sync.sql）。端末の記録は今までどおり素の
 * localStorage が正で、ログイン中に取ったものだけがアカウントにも載る
 * （useBaselineStore 参照）。
 */
const TABLE = "user_baseline_checks";

interface CheckRow {
  id: string;
  data: unknown;
}

function assertClient() {
  if (!supabase) throw new Error("Supabase client not initialized");
  return supabase;
}

function isCheck(v: unknown): v is BaselineCheck {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.recordedAt === "string";
}

/** 端末ローカルの保存状態（`cloud`）はクラウドへ持っていかない。 */
function toCloudData(check: BaselineCheck): BaselineCheck {
  const data = { ...check };
  delete data.cloud;
  return data;
}

/**
 * ユーザーの全チェック（古い→新しい）。ページ送りは主キー（id）順で読み、
 * 並べ替えは読み終えてから記録時刻で行う。管理者は全員の行を読めるので
 * user_id の絞り込みは外さないこと。
 */
export async function listBaselineChecks(userId: string): Promise<BaselineCheck[]> {
  const sb = assertClient();
  const rows = await selectAllByKey<CheckRow>(
    (r) => r.id,
    (after) => {
      let q = sb
        .from(TABLE)
        .select("id, data", { count: after === null ? "exact" : undefined })
        .eq("user_id", userId);
      if (after !== null) q = q.gt("id", after);
      return q.order("id", { ascending: true }).limit(PAGE_SIZE);
    }
  );
  return rows
    .map((r) => r.data)
    .filter(isCheck)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0));
}

export async function upsertBaselineCheck(userId: string, check: BaselineCheck): Promise<void> {
  const sb = assertClient();
  const { error } = await sb.from(TABLE).upsert(
    {
      user_id: userId,
      id: check.id,
      recorded_at: check.recordedAt,
      data: toCloudData(check),
    },
    { onConflict: "user_id,id" }
  );
  if (error) throw error;
}

export async function deleteBaselineCheck(userId: string, id: string): Promise<void> {
  const sb = assertClient();
  const { error } = await sb.from(TABLE).delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}
