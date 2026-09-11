import type { ProgramConfig } from "../programs";
import { MODULAR_BEATS } from "../zodiac";

/**
 * 開発時だけ走る自己点検。テストランナーがまだ無いので、壊れたら
 * `pnpm dev` のコンソールに出す形にしてある（本番ビルドでは呼び出しごと
 * 落ちるので、束の大きさには影響しない）。
 *
 * 見ているのは「静かに壊れる」種類のものだけ——型では捕まらず、画面も
 * それらしく描画されてしまうが、意味が違っているもの。
 */
export function assertCatalog(all: readonly ProgramConfig[]): void {
  const problems: string[] = [];
  const seen = new Map<string, number>();

  for (const p of all) {
    seen.set(p.id, (seen.get(p.id) ?? 0) + 1);

    // Visualizer は最初の相位名が「導入」のときだけ targetBeatFreq を出す特判を持つ。
    if (p.phases[0]?.name !== "導入") {
      problems.push(`${p.id}: 最初の相位が「導入」でない（${p.phases[0]?.name}）`);
    }

    // getAdjustedProgram は未知 id でも defaultDuration を最後の相位の endTime で
    // 上書きする。ズレていると尺が黙って変わり、カードに嘘のバッジも出る。
    const last = p.phases[p.phases.length - 1];
    if (last && last.endTime !== p.defaultDuration) {
      problems.push(
        `${p.id}: defaultDuration(${p.defaultDuration}) と最後の相位の endTime(${last.endTime}) が不一致`
      );
    }

    // 相位は隙間なく連続していること（getCurrentPhaseInfo が穴で止まる）。
    for (let i = 0; i < p.phases.length; i++) {
      const ph = p.phases[i];
      if (ph.startTime >= ph.endTime) problems.push(`${p.id}: 相位「${ph.name}」の長さが 0 以下`);
      const next = p.phases[i + 1];
      if (next && ph.endTime !== next.startTime) {
        problems.push(`${p.id}: 相位「${ph.name}」と「${next.name}」の間に隙間`);
      }
    }

    // 中高年の聴覚に合わせた上限（CLAUDE.md）。
    if (!(p.carrierFreq > 0 && p.carrierFreq <= 1000)) {
      problems.push(`${p.id}: 載波 ${p.carrierFreq}Hz が 0〜1000Hz の外`);
    }

    // id の前置きは予約済みのものと衝突しないこと。
    if (p.category && p.category !== "astro" && p.id.startsWith("zodiac-")) {
      problems.push(`${p.id}: "zodiac-" は星座節目の前置き（musicBedUrl が解釈する）`);
    }
    if (p.id.startsWith("custom-")) {
      problems.push(`${p.id}: "custom-" は合成器の節目の前置き（isCustomProgramId が解釈する）`);
    }

    if (p.category === "target" && !p.subGenre) {
      problems.push(`${p.id}: Target なのに subGenre が無い（見出しに入らず消える）`);
    }

    // カタログのビートは既存の語彙から選ぶ（lib/zodiac.ts の MODULAR_BEATS）。
    // 内蔵3節目だけは仕様書どおりの独自値（1.5Hz 等）なので対象外。
    // MODULAR_BEATS はリテラル型の組なので、任意の number を照合するには広げる。
    const beatVocabulary: readonly number[] = MODULAR_BEATS;
    if ((p.category === "target" || p.category === "energy") &&
        !beatVocabulary.includes(p.targetBeatFreq)) {
      problems.push(`${p.id}: ビート ${p.targetBeatFreq}Hz が MODULAR_BEATS の外`);
    }
  }

  for (const [id, count] of seen) {
    if (count > 1) problems.push(`id が重複: ${id}（${count}件)`);
  }

  if (problems.length > 0) {
    console.error(`[catalog] ${problems.length} 件の不整合:\n  - ${problems.join("\n  - ")}`);
  }

  const provisional = all.filter((p) => p.paramsProvisional).length;
  if (provisional > 0) {
    console.info(
      `[catalog] ${provisional}/${all.length} 件が暫定パラメータ（TODO(xlsx)）。` +
        `一覧 xlsx を取り込むと減る。`
    );
  }
}
