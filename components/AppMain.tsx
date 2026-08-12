"use client";

import { ReactNode } from "react";
import { useMiniPlayerVisible } from "@/components/MiniPlayer";
import { useSidebarStore } from "@/store/useSidebarStore";

/**
 * The page content column. Bottom padding grows while the mini-player bar is
 * visible (mobile: bottom nav 64px + bar ~72px; desktop: docked bar ~88px)
 * so long pages stay fully scrollable. First paint always renders the narrow
 * padding (playback starts false), so there is no hydration mismatch.
 *
 * デスクトップでレールが収納されている間は、左上に浮くランチャーボタンが
 * ページ見出しに重ならないよう左に 5rem の溝を空ける（`md:px-8` と当たら
 * ないよう、この分岐では pl/pr を明示的に書き分けている）。
 */
export default function AppMain({ children }: { children: ReactNode }) {
  const miniPlayerVisible = useMiniPlayerVisible();
  const sidebarOpen = useSidebarStore((s) => s.open);
  return (
    <main
      className={`mx-auto w-full max-w-[480px] md:max-w-5xl min-h-screen px-4 transition-[padding] duration-300 ease-out motion-reduce:transition-none ${
        sidebarOpen ? "md:pl-8 md:pr-8" : "md:pl-20 md:pr-8"
      } ${miniPlayerVisible ? "pb-36 md:pb-32" : "pb-20 md:pb-10"}`}
    >
      {children}
    </main>
  );
}
