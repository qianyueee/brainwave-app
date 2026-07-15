"use client";

import { useSyncExternalStore } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

const SERVER_COLORS = "#4a7fd4|#1e3a5f|#8890a8";

function readThemeColors(): string {
  if (typeof window === "undefined") return SERVER_COLORS;
  const get = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  return [
    get("--color-primary", "#4a7fd4"),
    get("--color-navy-lighter", "#1e3a5f"),
    get("--color-text-secondary", "#8890a8"),
  ].join("|");
}

function subscribeTheme(cb: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, cb);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, cb);
}

/**
 * Per-Hz frequency spectrum as a line/area chart: x = frequency (Hz), y =
 * relative amplitude (the FFT magnitude of the raw waveform, arbitrary units).
 * `spectrum[i]` is the magnitude at (i+1) Hz.
 */
export default function BrainSpectrumChart({ spectrum }: { spectrum: number[] }) {
  const data = spectrum.map((v, i) => ({ hz: i + 1, amp: v }));

  const colorStr = useSyncExternalStore(subscribeTheme, readThemeColors, () => SERVER_COLORS);
  const [line, grid, axis] = colorStr.split("|");

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
        <defs>
          <linearGradient id="specFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={line} stopOpacity={0.35} />
            <stop offset="100%" stopColor={line} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis
          dataKey="hz"
          type="number"
          domain={[1, data.length]}
          ticks={[1, 5, 10, 15, 20, 25, 30, 35, 40, 45]}
          tick={{ fill: axis, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: grid }}
          label={{ value: "Hz", position: "insideBottomRight", offset: -2, fill: axis, fontSize: 11 }}
        />
        <YAxis
          tick={{ fill: axis, fontSize: 10 }}
          width={40}
          tickLine={false}
          axisLine={{ stroke: grid }}
        />
        <Area
          type="monotone"
          dataKey="amp"
          stroke={line}
          strokeWidth={2}
          fill="url(#specFill)"
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
