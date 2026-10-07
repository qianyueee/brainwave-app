import type { FrequencyPhase } from "../programs";
import type { BeatPlan } from "./program-list";

/**
 * 一覧の鳴らし方（program-list.ts の BeatPlan）→ 相位列。
 *
 * 基本の形は設計書の「周波数スライド（Ramping）」どおり——10Hz のアルファで入り、
 * 目標のビートまで滑らせ、保ち、最後は 10Hz へ戻す（2Hz のデルタでも聴き手を
 * 冷たく放り出さない「起こして終わる」形）。睡眠系は outro "hold" で下げたまま
 * 終える。区切りは 15 分版の 2・6・13 分の比で尺に合わせて配分する。
 *
 * 最初の相位名は必ず `導入`——components/Visualizer.tsx がそこだけ targetBeatFreq を
 * 表示する特判を持つ。ほかの相位名は phaseLabel（lib/programs.ts）が訳せるものだけを使う。
 *
 * ⚠ phases と duration を必ず同じ計算から返すのが肝心。ProgramCard は
 * getAdjustedProgram の戻り値の defaultDuration と元の defaultDuration を
 * 比べて「パーソナライズ済み」バッジを出すが、getAdjustedProgram は未知 id に
 * 対しても defaultDuration を「最後の相位の endTime」で上書きする
 * （lib/brain-profile.ts）。両者がズレると全カードに嘘のバッジが出る。
 */
export interface PlannedTimeline {
  phases: FrequencyPhase[];
  /** 最後の相位の endTime と必ず一致する。そのまま defaultDuration に入れる。 */
  duration: number;
  /** この節目の誘導周波数（ProgramConfig.targetBeatFreq）。 */
  targetBeatFreq: number;
  /** layered の2つ目のビート（主の組と同時に一定で鳴らす）。 */
  extraBeat?: number;
}

/** 入口のビート（アルファ）。 */
export const INTRO_BEAT = 10;
/** 既定の出口のビート＝起こして終わる。 */
export const OUTRO_BEAT = 10;
/** wave が幅を1往復する目安の秒数。 */
const WAVE_PERIOD_SEC = 120;

/** 小数第2位まで（7.83 や 1.75 をそのまま持てる桁）。 */
const round2 = (v: number) => Math.round(v * 100) / 100;

function phase(
  name: string,
  startTime: number,
  endTime: number,
  startBeatFreq: number,
  endBeatFreq: number
): FrequencyPhase {
  return { name, startTime, endTime, startBeatFreq, endBeatFreq };
}

/** 終わりの相位の名前：上げて終えるなら覚醒、下げて終えるなら収束。 */
function endingName(from: number, to: number): string {
  return to > from ? "覚醒" : "収束";
}

/**
 * 15 分版の区切り（導入の終わり・遷移の終わり・同調の終わり）を尺に合わせる。
 * どれも1秒以上の長さを保つ（相位の長さ 0 は getCurrentPhaseInfo が飛ばしてしまう）。
 */
function marks(duration: number): { a: number; b: number; c: number } {
  const a = Math.max(1, Math.round(duration * (2 / 15)));
  const b = Math.max(a + 1, Math.round(duration * (6 / 15)));
  const c = Math.min(duration - 1, Math.max(b + 1, Math.round(duration * (13 / 15))));
  return { a, b, c };
}

/** 導入（＋遷移）：INTRO_BEAT から start へ。同じ値なら遷移を省いて導入を伸ばす。 */
function opening(start: number, a: number, b: number): FrequencyPhase[] {
  if (start === INTRO_BEAT) return [phase("導入", 0, b, start, start)];
  return [
    phase("導入", 0, a, INTRO_BEAT, INTRO_BEAT),
    phase("遷移", a, b, INTRO_BEAT, start),
  ];
}

/** 終わり：last（同調の最後の値）から outro へ。hold は last のまま「定着」で保つ。 */
function ending(
  last: number,
  outro: number | "hold",
  c: number,
  duration: number
): FrequencyPhase[] {
  const end = outro === "hold" ? last : outro;
  if (end === last) return [phase("定着", c, duration, last, last)];
  return [phase(endingName(last, end), c, duration, last, end)];
}

/** 一定のビート：導入 → 遷移 → 同調 → 収束。出口が同じ値なら同調をそのまま最後まで。 */
function steadyPhases(
  hz: number,
  outro: number | "hold",
  duration: number
): FrequencyPhase[] {
  const { a, b, c } = marks(duration);
  const end = outro === "hold" ? hz : outro;
  if (end === hz) return [...opening(hz, a, b), phase("同調", b, duration, hz, hz)];
  return [
    ...opening(hz, a, b),
    phase("同調", b, c, hz, hz),
    phase(endingName(hz, end), c, duration, hz, end),
  ];
}

/** from から to へ一方向に滑らせる。 */
function sweepPhases(
  from: number,
  to: number,
  outro: number | "hold",
  duration: number
): FrequencyPhase[] {
  const { a, b, c } = marks(duration);
  return [...opening(from, a, b), phase("同調", b, c, from, to), ...ending(to, outro, c, duration)];
}

/**
 * lo〜hi を往復する。中間から入って上・下・上…と回り、中間で同調を終える
 * （1往復＝中間→上→下→中間）。往復の回数は同調の長さを WAVE_PERIOD_SEC で
 * 割った数。速さ（Hz/秒）は全区間で同じ。
 */
function wavePhases(
  lo: number,
  hi: number,
  outro: number | "hold",
  duration: number
): FrequencyPhase[] {
  // 幅の無い「幅」（lo と hi が同じ・逆）は往復できないので、その値を保つだけ。
  if (!(hi > lo)) return steadyPhases(lo, outro, duration);
  const { a, b, c } = marks(duration);
  const mid = round2((lo + hi) / 2);
  const cycles = Math.max(1, Math.round((c - b) / WAVE_PERIOD_SEC));
  const points = [mid, hi];
  for (let i = 0; i < cycles; i++) points.push(lo, i === cycles - 1 ? mid : hi);
  const lengths = points.slice(1).map((p, i) => Math.abs(p - points[i]));
  const total = lengths.reduce((s, v) => s + v, 0);

  const legs: FrequencyPhase[] = [];
  let walked = 0;
  let t0 = b;
  for (let i = 0; i < lengths.length; i++) {
    walked += lengths[i];
    const t1 = i === lengths.length - 1 ? c : Math.round(b + ((c - b) * walked) / total);
    legs.push(phase("同調", t0, t1, points[i], points[i + 1]));
    t0 = t1;
  }
  return [...opening(mid, a, b), ...legs, ...ending(mid, outro, c, duration)];
}

/**
 * 一覧が道筋を決めているもの。キーフレームの間を直線で結ぶ。名前は最初が導入、
 * あとは平らで target なら同調・ほかの平らは定着・上りは覚醒・下りは降下。
 */
function pathPhases(
  keys: readonly (readonly [number, number])[],
  target: number,
  duration: number
): FrequencyPhase[] {
  const phases: FrequencyPhase[] = [];
  for (let i = 0; i + 1 < keys.length; i++) {
    const [f0, hz0] = keys[i];
    const [f1, hz1] = keys[i + 1];
    const t0 = Math.round(f0 * duration);
    const t1 = Math.round(f1 * duration);
    const name =
      i === 0
        ? "導入"
        : hz0 === hz1
          ? hz0 === target
            ? "同調"
            : "定着"
          : hz1 > hz0
            ? "覚醒"
            : "降下";
    phases.push(phase(name, t0, t1, hz0, hz1));
  }
  return phases;
}

/**
 * 一覧の1行 → 相位列・尺・誘導周波数。durationMin は節目の長さ（一覧には無いので
 * 呼び出し側が持つ）。
 */
export function planTimeline(
  plan: BeatPlan,
  durationMin = 15,
  outro: number | "hold" = OUTRO_BEAT
): PlannedTimeline {
  const duration = Math.round(durationMin * 60);
  switch (plan.kind) {
    case "steady":
      return {
        phases: steadyPhases(plan.hz, outro, duration),
        duration,
        targetBeatFreq: plan.hz,
      };
    case "layered":
      return {
        phases: steadyPhases(plan.hz, outro, duration),
        duration,
        targetBeatFreq: plan.hz,
        extraBeat: plan.extra,
      };
    case "sweep":
      return {
        phases: sweepPhases(plan.from, plan.to, outro, duration),
        duration,
        targetBeatFreq: plan.target ?? round2((plan.from + plan.to) / 2),
      };
    case "wave":
      return {
        phases: wavePhases(plan.lo, plan.hi, outro, duration),
        duration,
        targetBeatFreq: round2((plan.lo + plan.hi) / 2),
      };
    case "path":
      return {
        phases: pathPhases(plan.keys, plan.target, duration),
        duration,
        targetBeatFreq: plan.target,
      };
  }
}
