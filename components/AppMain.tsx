"use client";

import { ReactNode } from "react";
import { useMiniPlayerVisible } from "@/components/MiniPlayer";

/**
 * The page content column. Bottom padding grows while the mini-player bar is
 * visible (mobile: bottom nav 64px + bar ~72px; desktop: docked bar ~88px)
 * so long pages stay fully scrollable. First paint always renders the narrow
 * padding (playback starts false), so there is no hydration mismatch.
 */
export default function AppMain({ children }: { children: ReactNode }) {
  const miniPlayerVisible = useMiniPlayerVisible();
  return (
    <main
      className={`mx-auto w-full max-w-[480px] md:max-w-5xl min-h-screen px-4 md:px-8 ${
        miniPlayerVisible ? "pb-36 md:pb-32" : "pb-20 md:pb-10"
      }`}
    >
      {children}
    </main>
  );
}
