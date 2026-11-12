/**
 * 脳波を測っていたあいだ、プレーヤーに何が入っていたか——どの節目（プログラム）を、
 * 何秒再生して何秒一時停止していたか、何も流していなかったのは何秒か。
 *
 * 測定の記録（MindSessionSummary.playback → BrainProfile.playback）と10秒チェック
 * （BaselineCheck.playback）に同じ形で載せる。録音中は脳波計の1サンプル（＝1秒）ごとに
 * そのときのプレーヤーの状態を数え（tallyPlayback）、測り終えたら並べ直して残す
 * （finishPlayback）。1つの状態だけを写さず秒で数えるのは、測定の途中で再生を
 * 始めた・一時停止した・節目を替えた・流し終えた回も、何をどれだけ流していたかを
 * 後から読めるようにするため（誘導周波数の「いちばん長かったもの」と同じ数え方）。
 *
 * 「入っていた」＝ミニプレーヤーに節目のバーが出ている状態（再生中・一時停止中）。
 * 誘導周波数も一時停止中はその節目の値で見る（lib/mind/session-target.ts）。
 *
 * 型以外 import しない（node が直接読める純関数）。いまの1秒を数えるのは
 * lib/mind/playing-program.ts、表示の文は lib/mind/playback-label.ts。
 */

/** 測定中にプレーヤーに入っていた節目1つ。 */
export interface PlaybackProgram {
  /** ProgramConfig.id（合成器のカスタム節目・配信プログラムは `custom-…`）。 */
  id: string;
  /**
   * 測ったときの名前。組み込みの節目は日本語の名前（表示は id から表示言語で
   * 引き直す＝programNameById）。カスタム・配信は人が付けた名前で、後で改名・
   * 取り下げされても記録が読めるように写しておく。分からなければ空文字。
   */
  name: string;
  /** 節目の誘導周波数（ProgramConfig.targetBeatFreq、Hz）。カスタム節目には無い。 */
  hz?: number;
  /** 測定のうち、この節目を再生していた秒。 */
  playingSec: number;
  /** 測定のうち、この節目を一時停止していた秒。 */
  pausedSec: number;
}

export interface MeasurementPlayback {
  /** 入っていた節目。長く入っていた順（同じ長さなら先に入った順）。空＝何も流していない。 */
  programs: PlaybackProgram[];
  /** 何も入っていなかった秒（流していない・止めた・流し終えた）。 */
  noneSec: number;
}

/** 1秒ぶんのプレーヤーの状態。programId が null＝何も入っていない。 */
export interface PlaybackSecond {
  programId: string | null;
  paused: boolean;
}

/** 名前と誘導周波数を写す（初めて出てきた節目に1回だけ呼ぶ）。 */
export type DescribeProgram = (id: string) => { name: string; hz?: number };

export function emptyPlayback(): MeasurementPlayback {
  return { programs: [], noneSec: 0 };
}

/** この節目が入っていた秒（再生＋一時停止）。 */
export function loadedSec(p: PlaybackProgram): number {
  return p.playingSec + p.pausedSec;
}

/** 1秒ぶん数えた新しい値を返す（元の値は変えない）。 */
export function tallyPlayback(
  tally: MeasurementPlayback,
  second: PlaybackSecond,
  describe: DescribeProgram
): MeasurementPlayback {
  const id = second.programId;
  if (id === null) return { programs: tally.programs, noneSec: tally.noneSec + 1 };
  const i = tally.programs.findIndex((p) => p.id === id);
  const base: PlaybackProgram =
    i >= 0 ? tally.programs[i] : { id, ...describe(id), playingSec: 0, pausedSec: 0 };
  const next: PlaybackProgram = second.paused
    ? { ...base, pausedSec: base.pausedSec + 1 }
    : { ...base, playingSec: base.playingSec + 1 };
  const programs =
    i >= 0 ? tally.programs.map((p, j) => (j === i ? next : p)) : [...tally.programs, next];
  return { programs, noneSec: tally.noneSec };
}

/** 記録に残す形：長く入っていた順に並べる（sort は安定なので、同じ長さは先に入った順）。 */
export function finishPlayback(tally: MeasurementPlayback): MeasurementPlayback {
  return {
    programs: [...tally.programs].sort((a, b) => loadedSec(b) - loadedSec(a)),
    noneSec: tally.noneSec,
  };
}

/**
 * 一覧の短い表示に出す節目：測定の大半で何かが入っていたなら、いちばん長く入っていた
 * 節目。大半が「何も入っていない」なら null。同じ長さなら節目の方を採る（誘導周波数の
 * dominantTargetHz と同じ）。
 */
export function mainProgram(p: MeasurementPlayback): PlaybackProgram | null {
  const top = p.programs[0];
  if (!top) return null;
  const loaded = p.programs.reduce((sum, x) => sum + loadedSec(x), 0);
  return loaded >= p.noneSec ? top : null;
}

/**
 * 保存されていた値を確かめる（壊れた・古い形なら undefined＝「分からない」）。
 * 記録はアカウント（JSONB）と端末の localStorage から読むので、表示の前に1回通す。
 */
export function readPlayback(v: unknown): MeasurementPlayback | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.programs) || !isSeconds(o.noneSec)) return undefined;
  const programs: PlaybackProgram[] = [];
  for (const x of o.programs) {
    if (!x || typeof x !== "object") return undefined;
    const p = x as Record<string, unknown>;
    if (typeof p.id !== "string" || !p.id) return undefined;
    if (!isSeconds(p.playingSec) || !isSeconds(p.pausedSec)) return undefined;
    programs.push({
      id: p.id,
      name: typeof p.name === "string" ? p.name : "",
      ...(typeof p.hz === "number" && Number.isFinite(p.hz) ? { hz: p.hz } : {}),
      playingSec: p.playingSec,
      pausedSec: p.pausedSec,
    });
  }
  return { programs, noneSec: o.noneSec };
}

function isSeconds(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}
