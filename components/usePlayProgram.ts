"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
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
 * タップ＝選択してプレーヤーへ移動するだけ。**音は自動では鳴らさない**——
 * 再生はプレーヤー画面の再生ボタンでユーザーが押す（自動再生すると
 * プレーヤーに入る前にミニプレーヤーが現れて回り道になる、という
 * フィードバックによる意図的な仕様）。
 * 鳴っている最中のプログラムを再タップした場合は選択・タイマーを
 * リセットせずプレーヤーを開くだけ（一時停止中も isPlaying は true なので
 * 同じ保護が効く）。別プログラム再生中に他のカードを選んだ場合、音は
 * そのまま流れ続け、プレーヤーは音声の真実（playingProgramId）を表示する。
 */
export function usePlayProgram(): (target: ProgramConfig | CustomProgram) => void {
  const router = useRouter();
  const setSelectedProgramId = useAppStore((s) => s.setSelectedProgramId);
  const setTimerDuration = useAppStore((s) => s.setTimerDuration);
  const indicators = useBrainProfileStore((s) => s.profile?.indicators ?? null);

  return useCallback(
    (target: ProgramConfig | CustomProgram) => {
      const { isPlaying, selectedProgramId } = useAppStore.getState();
      if (!(isPlaying && selectedProgramId === target.id)) {
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
      }
      router.push("/player");
    },
    [router, setSelectedProgramId, setTimerDuration, indicators]
  );
}
