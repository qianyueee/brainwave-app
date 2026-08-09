"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { useAudio } from "@/components/AudioProvider";
import { getProgramById } from "@/lib/programs";
import { formatTime } from "@/lib/utils";
import { Play, Pause } from "lucide-react";

/**
 * バイノーラルセッションが生きている（再生中/一時停止中）かつプレーヤー画面に
 * いない間だけミニプレーヤーを出す。カスタム/シンセ再生は isSynthPlaying が
 * 立つので対象外（selectedProgramId が指す名前と鳴っている音がズレるため）。
 */
export function useMiniPlayerVisible(): boolean {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const isSynthPlaying = useSynthStore((s) => s.isSynthPlaying);
  const pathname = usePathname();
  return isPlaying && !isSynthPlaying && pathname !== "/player";
}

/**
 * Global now-playing bar above the bottom nav: program name + remaining time,
 * a pause/resume button, and tap-anywhere-else to return to /player — so
 * leaving the player page no longer makes the session invisible.
 */
export default function MiniPlayer() {
  const visible = useMiniPlayerVisible();
  const router = useRouter();
  const { pauseSession, resumeSession } = useAudio();
  const isPaused = useAppStore((s) => s.isPaused);
  const elapsed = useAppStore((s) => s.elapsed);
  const timerDuration = useAppStore((s) => s.timerDuration);
  const selectedProgramId = useAppStore((s) => s.selectedProgramId);

  if (!visible) return null;

  const program = getProgramById(selectedProgramId);
  const remaining = Math.max(0, timerDuration - elapsed);
  const openPlayer = () => router.push("/player");

  return (
    <div className="md:hidden fixed bottom-16 inset-x-0 z-40">
      <div className="mx-auto w-full max-w-[480px] px-3 pb-2">
        <div
          role="button"
          tabIndex={0}
          aria-label="プレーヤーを開く"
          onClick={openPlayer}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") openPlayer();
          }}
          className="bg-surface border border-surface-border rounded-2xl neu-raised flex items-center gap-3 pl-4 pr-2 py-2 min-h-16 cursor-pointer"
          style={{ animation: "slide-up 0.25s ease-out" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-text-primary truncate">
              {program?.name ?? "再生中"}
            </p>
            <p className="text-sm text-text-secondary tabular-nums">
              {isPaused ? "一時停止中" : `残り ${formatTime(remaining)}`}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isPaused) {
                resumeSession();
              } else {
                pauseSession();
              }
            }}
            className="min-w-12 min-h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center neu-raised-sm active:scale-95 shrink-0"
            aria-label={isPaused ? "再開" : "一時停止"}
          >
            {isPaused ? (
              <Play size={22} fill="currentColor" strokeWidth={0} className="ml-0.5" />
            ) : (
              <Pause size={22} fill="currentColor" strokeWidth={0} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
