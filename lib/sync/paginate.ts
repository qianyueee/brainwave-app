import type { PostgrestError } from "@supabase/supabase-js";

/** 1回の select で読む行数。Supabase の既定上限（max_rows）と同じ 1000。 */
export const PAGE_SIZE = 1000;

type Page<T> = { data: T[] | null; error: PostgrestError | null; count: number | null };

/**
 * 「1記録1行」のテーブルを全件読む。PostgREST は1回の select で既定 1000 行まで
 * しか返さないので、キーの昇順に並べて「前のページの最後のキーより後」を読み足す
 * （keyset。offset だと、読んでいる間に別の端末が古い日付の行を足したときに
 * ずれて取りこぼす）。
 *
 * - `page(after)`：`after`（前ページ最後のキー、初回は null）より後を PAGE_SIZE 件、
 *   キー昇順で返すクエリ。初回だけ `count: "exact"` を付けてもらい、件数が揃った
 *   ところで止める——1人の測定者を毎日測る程度なら1往復で終わる。
 * - サーバの上限がもっと小さく設定されていても、空のページが返るまで進むので
 *   取りこぼさない。
 */
export async function selectAllByKey<T>(
  keyOf: (row: T) => string,
  page: (after: string | null) => PromiseLike<Page<T>>
): Promise<T[]> {
  const out: T[] = [];
  let total: number | null = null;
  let after: string | null = null;
  for (;;) {
    const { data, error, count } = await page(after);
    if (error) throw error;
    const rows = data ?? [];
    if (total === null) total = count;
    out.push(...rows);
    if (rows.length === 0 || (total !== null && out.length >= total)) return out;
    after = keyOf(rows[rows.length - 1]);
  }
}
