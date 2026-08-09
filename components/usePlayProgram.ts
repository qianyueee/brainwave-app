"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAudio } from "@/components/AudioProvider";
import { useAppStore } from "@/store/useAppStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { getAdjustedProgram } from "@/lib/brain-profile";
import {
  isTimelineProgram,
  timelineTotalDuration,
  type ProgramConfig,
  type CustomProgram,
} from "@/lib/programs";

/**
 * 再生入口の共通ロジック（全プログラムカード/CTAが使う）。
 *
 * - タップ → その場で即座に再生を開始（画面遷移なし——ミニプレーヤーが
 *   出るので、詳細操作はそこから /player へ）。AudioContext はユーザー
 *   操作内で作成/再開する必要があるため、ハンドラー内で同期的に start する。
 * - 鳴っている最中のプログラムを再タップ → 進行・タイマーを守ったまま
 *   プレーヤーを開くだけ（一時停止中も isPlaying は true なので同じ保護が効く）
 */
export function usePlayProgram(): (target: ProgramConfig | CustomProgram) => void {
  const router = useRouter();
  const { startSession, startCustomProgram } = useAudio();
  const setSelectedProgramId = useAppStore((s) => s.setSelectedProgramId);
  const setTimerDuration = useAppStore((s) => s.setTimerDuration);
  const indicators = useBrainProfileStore((s) => s.profile?.indicators ?? null);

  return useCallback(
    (target: ProgramConfig | CustomProgram) => {
      const { isPlaying, selectedProgramId } = useAppStore.getState();
      if (isPlaying && selectedProgramId === target.id) {
        router.push("/player");
        return;
      }

      if ("preset" in target) {
        const duration = isTimelineProgram(target)
          ? timelineTotalDuration(target)
          : target.defaultDuration;
        setSelectedProgramId(target.id);
        setTimerDuration(duration);
        startCustomProgram(target, duration);
      } else {
        const adjusted = getAdjustedProgram(target.id, indicators) ?? target;
        const duration = adjusted.defaultDuration;
        setSelectedProgramId(target.id);
        setTimerDuration(duration);
        startSession(adjusted, duration);
      }
    },
    [router, startSession, startCustomProgram, setSelectedProgramId, setTimerDuration, indicators]
  );
}
