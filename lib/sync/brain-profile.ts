import { supabase } from "@/lib/supabase";
import type { BrainProfile } from "@/lib/brain-profile";
import { normalizeMeasurements } from "@/lib/brain-measurements";
import { PAGE_SIZE, selectAllByKey } from "./paginate";

/**
 * 脳波測定のクラウド保存。1測定1行（`user_brain_measurements`、PK は
 * user_id + uploaded_at。supabase/migrations/003_account_sync.sql）。
 *
 * 以前は1ユーザー1行の JSONB に全履歴を入れ、書くたびに丸ごと置き換えていた
 * （user_brain_profile）。書き手が Web とデスクトップ測定アプリの2つになると、
 * 古い配列を持った側が相手の追加分を消すので、各書き込みが自分の行しか触らない
 * 形に分けた。旧表は移行元の控えとして残っている（読み取りと削除のみ）。
 */
const TABLE = "user_brain_measurements";
const LEGACY_TABLE = "user_brain_profile";

interface MeasurementRow {
  uploaded_at: string;
  data: unknown;
}

function assertClient() {
  if (!supabase) throw new Error("Supabase client not initialized");
  return supabase;
}

/**
 * ユーザーの全測定（古い→新しい）。管理者は RLS 上だれの行でも読めるので、
 * user_id の絞り込みは外さないこと（外すと全員分が自分の履歴に混ざる）。
 */
export async function listBrainMeasurements(userId: string): Promise<BrainProfile[]> {
  const sb = assertClient();
  const rows = await selectAllByKey<MeasurementRow>(
    (r) => r.uploaded_at,
    (after) => {
      let q = sb
        .from(TABLE)
        .select("uploaded_at, data", { count: after === null ? "exact" : undefined })
        .eq("user_id", userId);
      if (after !== null) q = q.gt("uploaded_at", after);
      return q.order("uploaded_at", { ascending: true }).limit(PAGE_SIZE);
    }
  );
  // 行ごとに BrainProfile の形を確かめる（壊れた行が1つあっても他は読めるように）。
  return normalizeMeasurements(rows.map((r) => r.data));
}

/** 1件を書く。同じ uploadedAt の行があれば置き換える（再取り込み・メモ編集）。 */
export async function upsertBrainMeasurement(
  userId: string,
  measurement: BrainProfile
): Promise<void> {
  const sb = assertClient();
  const { error } = await sb
    .from(TABLE)
    .upsert(
      { user_id: userId, uploaded_at: measurement.uploadedAt, data: measurement },
      { onConflict: "user_id,uploaded_at" }
    );
  if (error) throw error;
}

export async function deleteBrainMeasurement(userId: string, uploadedAt: string): Promise<void> {
  const sb = assertClient();
  const { error } = await sb
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("uploaded_at", uploadedAt);
  if (error) throw error;
}

/** ユーザーの測定をすべて消す（脳特性の「すべて削除」）。 */
export async function deleteAllBrainMeasurements(userId: string): Promise<void> {
  const sb = assertClient();
  const { error } = await sb.from(TABLE).delete().eq("user_id", userId);
  if (error) throw error;
}

/**
 * 旧表（移行元の控え）に残っているこのユーザーの行を消す。「すべて削除」を
 * 頼まれたのに控えだけ残るのは困るので、そのときに一緒に呼ぶ。控えが無い・
 * 旧表が DROP 済みでも失敗扱いにしない（本体の削除はもう済んでいる）。
 */
export async function deleteLegacyBrainProfile(userId: string): Promise<void> {
  const sb = assertClient();
  const { error } = await sb.from(LEGACY_TABLE).delete().eq("user_id", userId);
  if (error) console.warn("[brain-profile] legacy cleanup skipped:", error.message);
}
