import type { ProgramConfig } from "../programs";
import { MODULAR_BEATS } from "../zodiac";
import { MAX_CARRIER_HZ } from "./factory";
import { PROGRAM_LIST } from "./program-list";

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

    // 中高年の聴覚に合わせた上限（CLAUDE.md）。一覧が 1000Hz を超える値を書いて
    // いても factory の playableCarrier が下げているはず。
    if (!(p.carrierFreq > 0 && p.carrierFreq <= MAX_CARRIER_HZ)) {
      problems.push(`${p.id}: 載波 ${p.carrierFreq}Hz が 0〜${MAX_CARRIER_HZ}Hz の外`);
    }
    for (const l of p.layers ?? []) {
      if (!(l.carrierFreq > 0 && l.carrierFreq <= MAX_CARRIER_HZ) || !(l.beatFreq >= 0)) {
        problems.push(`${p.id}: 重ねる組（${l.carrierFreq}Hz × ${l.beatFreq}Hz）が範囲外`);
      }
    }

    // ビートは 0 以上（0＝うなりの無い Pure Void）。負や NaN は右耳がキャリアより
    // 低くなる／周波数が壊れる。
    if (!(p.targetBeatFreq >= 0) || p.phases.some((ph) => !(ph.startBeatFreq >= 0 && ph.endBeatFreq >= 0))) {
      problems.push(`${p.id}: ビートに負または数でない値がある`);
    }

    // Target / Energy の周波数は一覧の写し（program-list.ts）から来る。載っていない
    // と factory が受け皿の値で鳴らしてしまう。
    if ((p.category === "target" || p.category === "energy") && !PROGRAM_LIST[p.id]) {
      problems.push(`${p.id}: lib/catalog/program-list.ts に一覧の写しが無い`);
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

    // 暫定値のビートは既存の語彙から選ぶ（lib/zodiac.ts の MODULAR_BEATS）。
    // 縛るのは「一覧に値が無くてこちらが決めた値」だけ——一覧の値は仕様が
    // 決めたものなので、この語彙の外でも正しい。
    // MODULAR_BEATS はリテラル型の組なので、任意の number を照合するには広げる。
    const beatVocabulary: readonly number[] = MODULAR_BEATS;
    if (p.paramsProvisional && (p.category === "target" || p.category === "energy") &&
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
      `[catalog] ${provisional}/${all.length} 件のビートが暫定値（一覧に鳴らせる値が無い。` +
        `lib/catalog/program-list.ts の note）。`
    );
  }
}
