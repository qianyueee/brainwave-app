import { supabase } from "@/lib/supabase";
import { isRecordKind, keyKind, type RemoteRecord } from "./record-merge";
import { PAGE_SIZE, selectAllByKey } from "./paginate";

/**
 * 端末をまたいで同じにする小さな記録のクラウド保存（`user_records`、1件1行、
 * supabase/migrations/005_user_records.sql）。合わせ方は lib/sync/record-merge.ts、
 * 送信と読み直しは lib/sync/record-sender.ts。
 *
 * どの端末もふつうに upsert するだけでよい——「いまの行より古い書き込み」はアカウント
 * 側のトリガが捨てる（新しい方が勝つ）。削除も deleted=true の upsert。
 */
const TABLE = "user_records";

/** 1回の upsert で送る行数（PostgREST の本文が大きくなりすぎないように）。 */
const UPSERT_CHUNK = 200;

interface RecordRow {
  id: string;
  kind: string;
  data: unknown;
  deleted: boolean;
  updated_at: string;
}

function assertClient() {
  if (!supabase) throw new Error("Supabase client not initialized");
  return supabase;
}

function fromRow(r: RecordRow): RemoteRecord | null {
  if (typeof r.id !== "string" || !isRecordKind(r.kind) || keyKind(r.id) !== r.kind) return null;
  const t = Date.parse(r.updated_at);
  if (!Number.isFinite(t)) return null;
  const data =
    r.data && typeof r.data === "object" && !Array.isArray(r.data)
      ? (r.data as Record<string, unknown>)
      : {};
  return {
    key: r.id,
    kind: r.kind,
    data,
    deleted: r.deleted === true,
    // 表記を端末で作った時刻（…Z）と揃える。DB からは …+00:00 で返る。
    updatedAt: new Date(t).toISOString(),
  };
}

/**
 * ユーザーの全記録（墓標を含む）。ページ送りは主キー（id）順。RLS で本人の行しか
 * 読めないが、ほかの表と同じく user_id でも必ず絞る。
 */
export async function listUserRecords(userId: string): Promise<RemoteRecord[]> {
  const sb = assertClient();
  const rows = await selectAllByKey<RecordRow>(
    (r) => r.id,
    (after) => {
      let q = sb
        .from(TABLE)
        .select("id, kind, data, deleted, updated_at", {
          count: after === null ? "exact" : undefined,
        })
        .eq("user_id", userId);
      if (after !== null) q = q.gt("id", after);
      return q.order("id", { ascending: true }).limit(PAGE_SIZE);
    }
  );
  return rows.map(fromRow).filter((r): r is RemoteRecord => r !== null);
}

/** まとめて書く（新しい方が勝つのはアカウント側のトリガ）。 */
export async function upsertUserRecords(userId: string, records: readonly RemoteRecord[]): Promise<void> {
  const sb = assertClient();
  for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
    const chunk = records.slice(i, i + UPSERT_CHUNK).map((r) => ({
      user_id: userId,
      id: r.key,
      kind: r.kind,
      data: r.deleted ? {} : r.data,
      deleted: r.deleted,
      updated_at: r.updatedAt,
    }));
    const { error } = await sb.from(TABLE).upsert(chunk, { onConflict: "user_id,id" });
    if (error) throw error;
  }
}
