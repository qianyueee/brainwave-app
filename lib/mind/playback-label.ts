import { programNameById } from "@/lib/programs";
import { formatTime } from "@/lib/utils";
import { translator, type Locale } from "@/lib/i18n";
import {
  mainProgram,
  readPlayback,
  type MeasurementPlayback,
  type PlaybackProgram,
} from "./measurement-playback";

/**
 * 記録の「プログラム」欄の言葉（測定中にプレーヤーに何が入っていたか。
 * lib/mind/measurement-playback.ts）。描画中は useLocale() の値を渡す。
 */

/** 節目の表示名：組み込みは表示言語で id から引き直し、カスタム・配信は写した名前。 */
export function playbackProgramName(p: PlaybackProgram, locale: Locale): string {
  return (
    programNameById(p.id, p.name, locale) ||
    translator(locale)("名前のないプログラム", "Untitled program")
  );
}

/**
 * 記録の「プログラム」欄の文。null＝分からない（この項目より前の記録・ファイルの
 * アップロード）ので欄ごと出さない。
 *
 * 測定のあいだ1つの状態だった回（ほとんどの測定）は時間を書かない：
 *   「なし」／「クラリティ・フォーカス（再生中）」／「クラリティ・フォーカス（一時停止中）」
 * 途中で変わった回は内訳を時間つきで：
 *   「クラリティ・フォーカス（再生 03:00・一時停止 01:00）／なし 00:40」
 */
export function describePlayback(
  raw: MeasurementPlayback | undefined,
  locale: Locale
): string | null {
  const p = readPlayback(raw);
  if (!p) return null;
  const t = translator(locale);
  if (p.programs.length === 0) return t("なし", "None");
  if (p.programs.length === 1 && p.noneSec === 0) {
    const only = p.programs[0];
    const name = playbackProgramName(only, locale);
    if (only.pausedSec === 0) return t(`${name}（再生中）`, `${name} (playing)`);
    if (only.playingSec === 0) return t(`${name}（一時停止中）`, `${name} (paused)`);
  }
  const parts = p.programs.map((x) => {
    const spans = [
      x.playingSec > 0
        ? t(`再生 ${formatTime(x.playingSec)}`, `playing ${formatTime(x.playingSec)}`)
        : null,
      x.pausedSec > 0
        ? t(`一時停止 ${formatTime(x.pausedSec)}`, `paused ${formatTime(x.pausedSec)}`)
        : null,
    ]
      .filter(Boolean)
      .join(t("・", " · "));
    const name = playbackProgramName(x, locale);
    return t(`${name}（${spans}）`, `${name} (${spans})`);
  });
  if (p.noneSec > 0) parts.push(t(`なし ${formatTime(p.noneSec)}`, `none ${formatTime(p.noneSec)}`));
  return parts.join(t("／", " / "));
}

/**
 * 一覧の行（測定の比較・カレンダーの当日明細）に添える短い印：測定の大半で
 * 入っていた節目の名前に ♪ を付けたもの。主に何も流していなかった回・分からない回は
 * null（行を長くしない。内訳は記録のカードで読める）。
 */
export function mainProgramLabel(
  raw: MeasurementPlayback | undefined,
  locale: Locale
): string | null {
  const p = readPlayback(raw);
  const main = p ? mainProgram(p) : null;
  return main ? `♪${playbackProgramName(main, locale)}` : null;
}
