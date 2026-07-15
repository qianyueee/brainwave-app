"use client";

import { useSyncExternalStore } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

/** Classic EEG band ranges (Hz), used to shade + label the spectrum. `to` is
 *  clamped to the data length for the last (γ) band. */
const BANDS: { key: string; label: string; from: number; to: number; color: string }[] = [
  { key: "delta", label: "δ波", from: 1, to: 4, color: "#94a3b8" },
  { key: "theta", label: "θ波", from: 4, to: 8, color: "#38bdf8" },
  { key: "alpha", label: "α波", from: 8, to: 13, color: "#22c55e" },
  { key: "beta", label: "β波", from: 13, to: 30, color: "#fb923c" },
  { key: "gamma", label: "γ波", from: 30, to: 45, color: "#d946ef" },
];

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
  const maxHz = data.length;

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 14, right: 12, left: -8, bottom: 4 }}>
          <defs>
            <linearGradient id="specFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={line} stopOpacity={0.35} />
              <stop offset="100%" stopColor={line} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />

          {/* Band ranges: tinted regions + a label at the top of each. */}
          {BANDS.map((b) => (
            <ReferenceArea
              key={b.key}
              x1={b.from}
              x2={Math.min(b.to, maxHz)}
              fill={b.color}
              fillOpacity={0.12}
              stroke={grid}
              strokeOpacity={0.4}
              label={{ value: b.label, position: "insideTop", fill: axis, fontSize: 10 }}
            />
          ))}

          <XAxis
            dataKey="hz"
            type="number"
            domain={[1, maxHz]}
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

      {/* Band legend with Hz ranges. */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-1 text-xs text-text-secondary">
        {BANDS.map((b) => (
          <span key={b.key} className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: b.color, opacity: 0.7 }}
            />
            {b.label} {b.from}–{Math.min(b.to, maxHz)}Hz
          </span>
        ))}
      </div>
    </div>
  );
}
