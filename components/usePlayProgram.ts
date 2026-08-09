"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAudio } from "@/components/AudioProvider";
import { useAppStore } from "@/store/useAppStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { getAdjustedProgram } from "@/lib/brain-profile";
import {
  isCustomProgramId,
  isTimelineProgram,
  timelineTotalDuration,
  type ProgramConfig,
  type CustomProgram,
} from "@/lib/programs";

/**
 * 再生入口の共通ロジック（全プログラムカード/CTAが使う）。
 *
 * タップ＝そのプログラムを選ぶ、という一貫した意味にする：
 * - 何も鳴っていない → 選択してプレーヤーへ。**音は自動では鳴らさない**
 *   （再生はプレーヤー画面の再生ボタンで。自動再生すると入る前に
 *   ミニプレーヤーが現れて回り道になる、というフィードバックによる仕様）。
 * - 鳴っている最中のプログラム自身を再タップ → 進行・タイマーを守ったまま
 *   プレーヤーを開くだけ（一時停止中も isPlaying は true なので同じ保護）。
 *   判定は音声の真実 playingProgramId で行う（選択だけ別に動いていても
 *   誤リセットしない）。
 * - 別のプログラムが鳴っている中で新しいカードをタップ → 鳴っている方を
 *   停止（切替なのでログは残さない・一時停止中でも同様）してから選択して
 *   プレーヤーへ。プレーヤーは常に「いまタップしたもの」を表示する。
 */
export function usePlayProgram(): (target: ProgramConfig | CustomProgram) => void {
  const router = useRouter();
  const { stopSession, stopCustomProgram } = useAudio();
  const setSelectedProgramId = useAppStore((s) => s.setSelectedProgramId);
  const setTimerDuration = useAppStore((s) => s.setTimerDuration);
  const indicators = useBrainProfileStore((s) => s.profile?.indicators ?? null);

  return useCallback(
    (target: ProgramConfig | CustomProgram) => {
      const { isPlaying, playingProgramId } = useAppStore.getState();

      if (isPlaying && playingProgramId === target.id) {
        router.push("/player");
        return;
      }

      if (isPlaying && playingProgramId) {
        // A different program is sounding — choosing a new one replaces it.
        // Unlogged stop, same as the established program-switch semantics.
        if (isCustomProgramId(playingProgramId)) {
          stopCustomProgram();
        } else {
          stopSession();
        }
      }

      if ("preset" in target) {
        const duration = isTimelineProgram(target)
          ? timelineTotalDuration(target)
          : target.defaultDuration;
        setSelectedProgramId(target.id);
        setTimerDuration(duration);
      } else {
        const adjusted = getAdjustedProgram(target.id, indicators) ?? target;
        setSelectedProgramId(target.id);
        setTimerDuration(adjusted.defaultDuration);
      }
      router.push("/player");
    },
    [router, stopSession, stopCustomProgram, setSelectedProgramId, setTimerDuration, indicators]
  );
}
