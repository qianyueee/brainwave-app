"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { useAudio } from "@/components/AudioProvider";
import { getProgramById, isCustomProgramId } from "@/lib/programs";
import { formatTime } from "@/lib/utils";
import { Play, Pause } from "lucide-react";

/**
 * プログラム再生（バイノーラル/カスタム/タイムライン、再生中 or 一時停止中）が
 * 生きていてプレーヤー画面にいない間だけミニプレーヤーを出す。
 * playingProgramId が音声の真実なので、名前ズレの心配なくカスタムも表示できる。
 * プログラム身元のないもの（純シンセ＝isPlaying が立たない、タイムライン
 * プレビュー＝playingProgramId が null）は対象外。
 */
export function useMiniPlayerVisible(): boolean {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const playingProgramId = useAppStore((s) => s.playingProgramId);
  const pathname = usePathname();
  return isPlaying && playingProgramId !== null && pathname !== "/player";
}

/**
 * Global now-playing bar (above the bottom nav on mobile, docked to the
 * bottom of the content area on desktop): program name + remaining time, a
 * pause/resume button, and tap-anywhere-else to return to /player — so
 * leaving the player page no longer makes the session invisible.
 */
export default function MiniPlayer() {
  const visible = useMiniPlayerVisible();
  const router = useRouter();
  const { pauseSession, resumeSession } = useAudio();
  const isPaused = useAppStore((s) => s.isPaused);
  const elapsed = useAppStore((s) => s.elapsed);
  const timerDuration = useAppStore((s) => s.timerDuration);
  // Bound to the audio truth, not the (persisted) selection — the bar must
  // always name exactly what is sounding.
  const playingProgramId = useAppStore((s) => s.playingProgramId);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);
  const publishedPrograms = usePublishedProgramsStore((s) => s.programs);

  if (!visible || !playingProgramId) return null;

  const program = isCustomProgramId(playingProgramId)
    ? savedPrograms.find((p) => p.id === playingProgramId) ??
      publishedPrograms.find((p) => p.id === playingProgramId)
    : getProgramById(playingProgramId);
  const remaining = Math.max(0, timerDuration - elapsed);
  const openPlayer = () => router.push("/player");

  return (
    // Mobile: floats above the bottom nav. Desktop: full-width bar docked to
    // the bottom of the content area, starting right of the 240px side rail.
    <div className="fixed bottom-16 inset-x-0 z-40 md:bottom-0 md:left-60 md:right-0">
      <div className="mx-auto w-full max-w-[480px] px-3 pb-2 md:max-w-none md:px-8 md:pb-4">
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
