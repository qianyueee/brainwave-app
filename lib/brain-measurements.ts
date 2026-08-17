import type { BrainIndicators, BrainProfile } from "./brain-profile";

/**
 * Dependency-free helpers for the brain-measurement history.
 *
 * Kept import-free (only `import type`, which is erased at runtime) so the
 * cloud-blob migration logic can be unit-tested headlessly without pulling in
 * Supabase / Next.js.
 */

/** Type guard: a value that looks like a stored BrainProfile. */
function isProfile(v: unknown): v is BrainProfile {
  return !!v && typeof v === "object" && "indicators" in v;
}

/**
 * Normalize whatever is stored in the cloud blob / persisted state into a
 * measurements array. Tolerates three historical shapes:
 *  - a `BrainProfile[]` (current)              → filtered to valid entries
 *  - a single `BrainProfile` (legacy blob)     → wrapped into `[profile]`
 *  - null / undefined / garbage                → `[]`
 */
export function normalizeMeasurements(data: unknown): BrainProfile[] {
  if (Array.isArray(data)) return data.filter(isProfile);
  if (isProfile(data)) return [data];
  return [];
}

/** Composite "総合" score = rounded average of all 6 indicator values (0-100). */
export function compositeScore(indicators: BrainIndicators): number {
  const vals = Object.values(indicators);
  if (!vals.length) return 0;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

/**
 * Traffic-light color for a composite score (shared by history rows and
 * compare picks). Returns a CSS var() so the hue follows the time-of-day
 * palette — valid anywhere CSS color is accepted (inline style, CSS `fill`);
 * NOT valid as a raw SVG presentation attribute, use style={{fill}} there.
 */
export function scoreColor(score: number): string {
  return score >= 70
    ? "var(--dyn-success)"
    : score >= 40
      ? "var(--dyn-warning)"
      : "var(--dyn-danger)";
}

/** Short date-time label for a measurement, e.g. "7月13日 17:50". */
export function measurementLabel(m: BrainProfile): string {
  return new Date(m.uploadedAt).toLocaleString("ja-JP", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 見出しに立てる名前：取り込みのときに書いたメモがあればそれ、無ければ日時。
 * 日時だけの一覧では「どれがどの回か」を思い出せないので、本人の言葉があれば
 * そちらを先に見せ、日時は小さく下の行へ回す（過去の測定・記録の並びと同じ扱い）。
 */
export function measurementTitle(m: BrainProfile): string {
  return m.note?.trim() || measurementLabel(m);
}

/**
 * チャート凡例向けの1行ラベル：「測定者・メモ（無ければ日時）」。凡例は
 * 12px・折り返しありの狭い場所なので、メモは頭だけ取って省略する。一覧の
 * 見出しと同じ語が出るので、どの行がどの線かを目で追える。
 */
export function measurementSeriesLabel(m: BrainProfile, maxNoteChars = 12): string {
  const title = measurementTitle(m);
  const clipped =
    title.length > maxNoteChars ? `${title.slice(0, maxNoteChars)}…` : title;
  return m.subject ? `${m.subject}・${clipped}` : clipped;
}
