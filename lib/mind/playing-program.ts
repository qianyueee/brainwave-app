import { getProgramById, isCustomProgramId } from "@/lib/programs";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { tallyPlayback, type MeasurementPlayback } from "./measurement-playback";
import { playbackSecondOf } from "./session-target";

/**
 * 測定の記録に写す、プレーヤーに入っている節目の名前と誘導周波数。組み込み・目録・
 * 星座の節目は日本語の名前（表示は id から引き直す）、合成器のカスタム節目・配信
 * プログラムは人が付けた名前（ミニプレーヤーと同じ引き方）。
 */
export function describePlayingProgram(id: string): { name: string; hz?: number } {
  if (!isCustomProgramId(id)) {
    const p = getProgramById(id);
    if (p) return { name: p.name, hz: p.targetBeatFreq };
  }
  const custom =
    useSynthStore.getState().savedPrograms.find((p) => p.id === id) ??
    usePublishedProgramsStore.getState().programs.find((p) => p.id === id);
  return { name: custom?.name ?? "" };
}

/**
 * いまの1秒（プレーヤーの状態）を数え足した値を返す。録音中、脳波計のサンプルが
 * 1つ届くごとに呼ぶ（測定と10秒チェック）。
 */
export function tallyCurrentPlayback(tally: MeasurementPlayback): MeasurementPlayback {
  return tallyPlayback(tally, playbackSecondOf(useAppStore.getState()), describePlayingProgram);
}
