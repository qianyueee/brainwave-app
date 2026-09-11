/**
 * カタログ検索。節目の名前は日本語・英語・カタカナ・数字が混ざる
 * （「緊張・精神」「Anti-Anxiety & Panic Reset」「不安・パニック即時鎮静」
 * 「396Hz」）ので、検索対象は生成時に 1 本の文字列へ畳んでおき、照合側は
 * 正規化して「クエリの全トークンが含まれるか」だけを見る。
 *
 * 正規化は NFKC（全角英数・半角カナを畳む）＋小文字化＋カタカナ→ひらがな
 * ＋区切り記号の除去。記号を落とすので "anti-anxiety" と "antianxiety"、
 * "40 Hz" と "40hz" が同じに当たり、カナを畳むので「あーすすたー」でも
 * 「アーススター」に当たる（50〜60代の利用者は入力を切り替えずに打つ）。
 * 漢字→かなは辞書が要るので機械では畳めない——必要な読みは各節目の
 * keywords に手で足す。
 */

/** 区切りとして意味を持たない文字。改行だけは残す（フィールドの境界に使う）。 */
const NOISE = /[ \t　・･ー,，、。．.＆&+()（）[\]「」『』【】〜~/／|:：;；'"’”-]/g;

/** カタカナ→ひらがな（長音符は NOISE 側で落とす）。 */
function kanaToHiragana(s: string): string {
  return s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function normalizeSearchText(s: string): string {
  return kanaToHiragana(s.normalize("NFKC").toLowerCase()).replace(NOISE, "");
}

/**
 * 検索対象テキストを組み立てる。各要素を個別に正規化してから改行で継ぐ——
 * 継ぎ目をまたいだ偶然の一致（「…集中」＋「ワーク…」で "中ワ" に当たる等）を
 * 防ぐため。
 */
export function buildSearchText(parts: Array<string | number | undefined | null>): string {
  return parts
    .filter((p): p is string | number => p !== undefined && p !== null && p !== "")
    .map((p) => normalizeSearchText(String(p)))
    .filter(Boolean)
    .join("\n");
}

/**
 * クエリを空白で切り、全トークンが含まれれば一致。
 * 「40hz 集中」のような絞り込みが効く。空クエリは常に true。
 */
export function matchesQuery(searchText: string, query: string): boolean {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map(normalizeSearchText)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => searchText.includes(t));
}
