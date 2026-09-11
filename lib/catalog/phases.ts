import type { FrequencyPhase } from "../programs";

/**
 * カタログ節目（Target / Energy）の共通タイムライン。
 *
 * 形は星座節目の zodiacPhases と同じ——10Hz のアルファで入り、目標ビートまで
 * 滑らせ、保ち、最後は 10Hz へ戻す。2Hz のデルタ節目でも聴き手を冷たく放り出
 * さないための「起こして終わる」形。最初の相位名は必ず `導入`——
 * components/Visualizer.tsx がそこだけ targetBeatFreq を表示する特判を持つ。
 *
 * ⚠ phases と duration を必ず同じ計算から返すのが肝心。ProgramCard は
 * getAdjustedProgram の戻り値の defaultDuration と元の defaultDuration を
 * 比べて「パーソナライズ済み」バッジを出すが、getAdjustedProgram は未知 id に
 * 対しても defaultDuration を「最後の相位の endTime」で上書きする
 * （lib/brain-profile.ts）。両者がズレると全カードに嘘のバッジが出る。
 */
export interface CatalogTimeline {
  phases: FrequencyPhase[];
  /** 最後の相位の endTime と必ず一致する。そのまま defaultDuration に入れる。 */
  duration: number;
}

export interface CatalogPhaseOptions {
  /** 入口のビート。既定 10Hz（アルファ）。 */
  intro?: number;
  /**
   * 出口のビート。既定 10Hz＝起こして終わる。
   * ただし睡眠系はここを下げたまま終わらせること——寝入りかけた人を最後に
   * 10Hz へ引き上げてしまっては本末転倒（内蔵の night-recovery も 1.5→3.0 で
   * 終わり、10 へは戻さない）。
   */
  outro?: number;
}

/** 導入 / 遷移 / 同調 / 収束。区切りは 15 分版（2・6・13 分）の比で配分する。 */
export function catalogPhases(
  targetBeatFreq: number,
  durationMin = 15,
  { intro: introBeat = 10, outro: outroBeat = 10 }: CatalogPhaseOptions = {}
): CatalogTimeline {
  const duration = Math.round(durationMin * 60);
  const intro = Math.max(1, Math.round(duration * (2 / 15)));
  const ramp = Math.max(intro + 1, Math.round(duration * (6 / 15)));
  const hold = Math.max(ramp + 1, Math.round(duration * (13 / 15)));
  const t = targetBeatFreq;

  const phases: FrequencyPhase[] = [
    { name: "導入", startTime: 0, endTime: intro, startBeatFreq: introBeat, endBeatFreq: introBeat },
    { name: "遷移", startTime: intro, endTime: ramp, startBeatFreq: introBeat, endBeatFreq: t },
    { name: "同調", startTime: ramp, endTime: hold, startBeatFreq: t, endBeatFreq: t },
    { name: "収束", startTime: hold, endTime: duration, startBeatFreq: t, endBeatFreq: outroBeat },
  ];

  return { phases, duration };
}
