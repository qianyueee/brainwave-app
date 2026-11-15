import { translator, type Locale } from "@/lib/i18n";
import { readTreatmentPhase, type TreatmentPhase } from "@/lib/before-after";

/**
 * 施術のタイミング（lib/before-after.ts）の言葉。描画中は useLocale() の値を渡す。
 *
 * 日本語はどこでも「施術前・施術中・施術後」。英語は、選ぶボタン（3つ並ぶ）では
 * 短く Before / During / After、見出しの外（一覧の行・記録の欄）では何の前後かが
 * 分かるよう "Before the session" のように書く。
 */
const LABELS: Record<TreatmentPhase, { ja: string; en: string; enShort: string }> = {
  before: { ja: "施術前", en: "Before the session", enShort: "Before" },
  during: { ja: "施術中", en: "During the session", enShort: "During" },
  after: { ja: "施術後", en: "After the session", enShort: "After" },
};

export function treatmentPhaseLabel(
  p: TreatmentPhase,
  locale: Locale,
  { short = false }: { short?: boolean } = {}
): string {
  const l = LABELS[p];
  return locale === "en" ? (short ? l.enShort : l.en) : l.ja;
}

/**
 * 記録に添える言葉（一覧の行・記録の欄）。選んでいない回は null——プレーヤーから
 * 推し量った時点は AI 比較分析の中だけで使い、記録に選んだかのようには見せない。
 */
export function treatmentPhaseTag(raw: unknown, locale: Locale): string | null {
  const p = readTreatmentPhase(raw);
  return p ? treatmentPhaseLabel(p, locale) : null;
}

/**
 * 時点をいくつか並べた見出し：「施術前と施術後」「施術前・施術中・施術後」／
 * "Before and after the session"・"Before, during and after the session"。
 * 早い順に並べ、重なりは1つにする。
 */
export function treatmentPhasesTitle(phases: readonly TreatmentPhase[], locale: Locale): string {
  const order: TreatmentPhase[] = ["before", "during", "after"];
  const used = order.filter((p) => phases.includes(p));
  if (used.length === 0) return "";
  if (locale !== "en") {
    const names = used.map((p) => LABELS[p].ja);
    return names.length === 2 ? `${names[0]}と${names[1]}` : names.join("・");
  }
  const words = used.map((p) => LABELS[p].enShort.toLowerCase());
  const head = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return `${head.charAt(0).toUpperCase()}${head.slice(1)} the session`;
}

/** 「施術のタイミング: 施術前」の欄の見出し。 */
export function treatmentPhaseCaption(locale: Locale): string {
  return translator(locale)("施術のタイミング", "Session timing");
}
