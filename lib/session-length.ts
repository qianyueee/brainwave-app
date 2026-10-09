import type { FrequencyPhase, ProgramConfig } from "./programs";

/**
 * セッションの長さ（プレーヤーのタイマー）。秒で持ち、`UNLIMITED_DURATION`（0）は
 * 「無制限」＝止めるまで鳴らし続ける。
 *
 * 0 にしたのは、タイマーの値が localStorage（useAppStore の persist）に残るから——
 * Infinity は JSON にすると null になって、読み戻すと数でなくなる。0 秒のセッションは
 * 意味を持たないので取り違えも起きない。判定は必ず isUnlimitedDuration を通す
 * （`timerDuration - elapsed` や `timerDuration / defaultDuration` をそのまま
 * 計算すると、無制限では残り時間が 0・時間の伸び率が 0 になる）。
 *
 * 型以外 import しない。
 */
export const UNLIMITED_DURATION = 0;

export function isUnlimitedDuration(seconds: number): boolean {
  return !(seconds > 0);
}

/**
 * 終わりの相位の名前（上げて終える・下げて終える・眠りから浮かぶ）。無制限では
 * 終わりが来ないので、この相位は鳴らさない。
 */
const ENDING_PHASE_NAMES: ReadonlySet<string> = new Set(["覚醒", "収束", "浮上"]);

/**
 * 実際に鳴らす相位と時間の伸び率。
 *
 * - 時間を決めたとき：相位はそのまま、節目の長さを選んだ時間に伸び縮みさせる
 *   （timeScale = 選んだ時間 / 節目の既定の長さ）。
 * - 無制限：節目の既定の長さで導入から同調まで進み、最後の「終わりの相位」
 *   （覚醒・収束・浮上——同調から離れて起こす／戻す部分）は鳴らさない。最後の値を
 *   保ったまま、止めるまで同調を続ける（Web Audio は最後の予定の値を保つ）。
 *   終わりの相位しか無い節目・動かない終わり（hold の「定着」）はそのまま。
 *
 * 再生（BinauralSession）と表示（Visualizer）が同じこの1本を通る——鳴っている
 * 周波数と画面の周波数がずれないように。
 */
export function sessionTimeline(
  program: ProgramConfig,
  duration: number
): { phases: FrequencyPhase[]; timeScale: number } {
  if (!isUnlimitedDuration(duration)) {
    return { phases: program.phases, timeScale: duration / program.defaultDuration };
  }
  const last = program.phases[program.phases.length - 1];
  const dropEnding =
    program.phases.length > 1 &&
    last !== undefined &&
    ENDING_PHASE_NAMES.has(last.name) &&
    last.startBeatFreq !== last.endBeatFreq;
  return {
    phases: dropEnding ? program.phases.slice(0, -1) : program.phases,
    timeScale: 1,
  };
}
