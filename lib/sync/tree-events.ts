import { supabase } from "@/lib/supabase";
import { isTreeEventKind, type TreeEvent } from "@/lib/sync-tree";
import { PAGE_SIZE, selectAllByKey } from "./paginate";

/**
 * Sync Tree の出来事のクラウド保存。1件1行・追記のみ（`user_tree_events`、PK は
 * user_id + id。supabase/migrations/004_sync_tree.sql）。木はログイン中だけの
 * 機能で、データはアカウントにだけ置く——端末には持たず、ログインのたびに
 * ここから読む（store/useSyncTreeStore.ts）。
 */
const TABLE = "user_tree_events";

interface TreeEventRow {
  id: string;
  kind: string;
  day: string;
  occurred_at: string;
}

function assertClient() {
  if (!supabase) throw new Error("Supabase client not initialized");
  return supabase;
}

function fromRow(r: TreeEventRow): TreeEvent | null {
  if (typeof r.id !== "string" || typeof r.day !== "string" || !isTreeEventKind(r.kind)) {
    return null;
  }
  const t = Date.parse(r.occurred_at);
  if (!Number.isFinite(t)) return null;
  // 時刻の表記を端末で作った行（…Z）と揃える。DB からは …+00:00 で返る。
  return { id: r.id, kind: r.kind, day: r.day, occurredAt: new Date(t).toISOString() };
}

/**
 * ユーザーの全出来事。ページ送りは主キー（id）順——並べ替えは畳むとき
 * （foldTreeEvents）に時刻で行う。管理者は全員の行を読めるので user_id の
 * 絞り込みは外さないこと。
 */
export async function listTreeEvents(userId: string): Promise<TreeEvent[]> {
  const sb = assertClient();
  const rows = await selectAllByKey<TreeEventRow>(
    (r) => r.id,
    (after) => {
      let q = sb
        .from(TABLE)
        .select("id, kind, day, occurred_at", { count: after === null ? "exact" : undefined })
        .eq("user_id", userId);
      if (after !== null) q = q.gt("id", after);
      return q.order("id", { ascending: true }).limit(PAGE_SIZE);
    }
  );
  return rows.map(fromRow).filter((e): e is TreeEvent => e !== null);
}

/**
 * 1件書く。同じキーの行がもうあれば何もしない（ON CONFLICT DO NOTHING）——
 * 別の端末が同じ日に水やりしていた、送信の再試行が二度届いた、のどちらでも
 * 1行のまま。
 */
export async function insertTreeEvent(userId: string, e: TreeEvent): Promise<void> {
  const sb = assertClient();
  const { error } = await sb.from(TABLE).upsert(
    {
      user_id: userId,
      id: e.id,
      kind: e.kind,
      day: e.day,
      occurred_at: e.occurredAt,
    },
    { onConflict: "user_id,id", ignoreDuplicates: true }
  );
  if (error) throw error;
}
