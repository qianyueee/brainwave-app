"use client";

import { useSyncExternalStore } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { SPECTRUM_BANDS } from "./BrainSpectrumChart";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

const SERVER_COLORS = "#4a7fd4|#1e3a5f|#8890a8|#8890a8";

function readThemeColors(): string {
  if (typeof window === "undefined") return SERVER_COLORS;
  const get = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  return [
    get("--color-primary", "#4a7fd4"),
    get("--color-navy-lighter", "#1e3a5f"),
    get("--color-text-secondary", "#8890a8"),
    get("--color-text-muted", "#8890a8"),
  ].join("|");
}

function subscribeTheme(cb: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, cb);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, cb);
}

/**
 * Overlays two per-Hz spectra for before/after comparison: the earlier
 * measurement (前) as a muted grey line, the later (後) as the primary color,
 * over the same band-shaded frequency axis as BrainSpectrumChart.
 */
export default function BrainSpectrumCompare({
  beforeSpectrum,
  afterSpectrum,
  beforeLabel,
  afterLabel,
}: {
  beforeSpectrum: number[];
  afterSpectrum: number[];
  beforeLabel: string;
  afterLabel: string;
}) {
  const len = Math.max(beforeSpectrum.length, afterSpectrum.length);
  const data = Array.from({ length: len }, (_, i) => ({
    hz: i + 1,
    before: beforeSpectrum[i] ?? null,
    after: afterSpectrum[i] ?? null,
  }));

  const colorStr = useSyncExternalStore(subscribeTheme, readThemeColors, () => SERVER_COLORS);
  const [primary, grid, axis, muted] = colorStr.split("|");

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 14, right: 12, left: -8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />

          {SPECTRUM_BANDS.map((b) => (
            <ReferenceArea
              key={b.key}
              x1={b.from}
              x2={Math.min(b.to, len)}
              fill={b.color}
              fillOpacity={0.1}
              stroke={grid}
              strokeOpacity={0.4}
              label={{ value: b.label, position: "insideTop", fill: axis, fontSize: 10 }}
            />
          ))}

          <XAxis
            dataKey="hz"
            type="number"
            domain={[1, len]}
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
          <Line
            type="monotone"
            dataKey="before"
            stroke={muted}
            strokeWidth={2}
            strokeOpacity={0.75}
            isAnimationActive={false}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="after"
            stroke={primary}
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-1 text-xs text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-0.5 rounded"
            style={{ backgroundColor: muted, opacity: 0.75 }}
          />
          前: {beforeLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: primary }} />
          後: {afterLabel}
        </span>
      </div>
    </div>
  );
}
