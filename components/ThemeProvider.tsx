"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  TIME_PERIODS,
  applyPalette,
  getEffectivePalette,
  getCurrentPeriodIndex,
} from "@/lib/theme";

const POLL_INTERVAL = 10_000; // 10 seconds
const TAP_COUNT_TRIGGER = 5;
const TAP_WINDOW = 3000; // ms

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const overrideRef = useRef<number | null>(null); // null = auto, 0-8 = period index
  const tapTimesRef = useRef<number[]>([]);
  const dotRef = useRef<HTMLDivElement>(null);

  const applyTheme = useCallback(() => {
    if (overrideRef.current !== null) {
      applyPalette(TIME_PERIODS[overrideRef.current].palette);
      return;
    }
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReduced) {
      const idx = getCurrentPeriodIndex(new Date());
      applyPalette(TIME_PERIODS[idx].palette);
    } else {
      applyPalette(getEffectivePalette(new Date()));
    }
  }, []);

  useEffect(() => {
    applyTheme();
    const id = setInterval(applyTheme, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [applyTheme]);

  const handleDevTap = useCallback(() => {
    const now = Date.now();
    tapTimesRef.current = tapTimesRef.current.filter(
      (t) => now - t < TAP_WINDOW
    );
    tapTimesRef.current.push(now);

    if (tapTimesRef.current.length >= TAP_COUNT_TRIGGER) {
      tapTimesRef.current = [];
      if (overrideRef.current === null) {
        overrideRef.current = 0;
      } else {
        const next = overrideRef.current + 1;
        overrideRef.current = next >= TIME_PERIODS.length ? null : next;
      }
      applyTheme();
      // Update dot indicator
      if (dotRef.current) {
        dotRef.current.style.opacity = overrideRef.current !== null ? "1" : "0";
      }
    }
  }, [applyTheme]);

  return (
    <>
      {/* Dev override tap target */}
      <div
        onClick={handleDevTap}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 20,
          height: 20,
          zIndex: 9999,
        }}
        aria-hidden="true"
      />
      {/* Override active indicator */}
      <div
        ref={dotRef}
        style={{
          position: "fixed",
          top: 2,
          left: 2,
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: "#ff4444",
          opacity: 0,
          zIndex: 9999,
          pointerEvents: "none",
          transition: "opacity 0.3s ease-out",
        }}
        aria-hidden="true"
      />
      {children}
    </>
  );
}
