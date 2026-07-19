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
import { compareSeriesColors } from "@/lib/compare-colors";
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

export interface SpectrumSeries {
  spectrum: number[];
  label: string;
}

/**
 * Overlays 2–3 per-Hz spectra for comparison, oldest→newest, over the same
 * pie-colored band shading as BrainSpectrumChart. Line colors go muted → accent
 * → primary so the newest measurement reads as the most prominent; a legend
 * maps each color to its date.
 */
export default function BrainSpectrumCompare({ series }: { series: SpectrumSeries[] }) {
  const len = series.reduce((m, s) => Math.max(m, s.spectrum.length), 0);
  const data = Array.from({ length: len }, (_, i) => {
    const row: Record<string, number | null> = { hz: i + 1 };
    series.forEach((s, si) => {
      row[`s${si}`] = s.spectrum[i] ?? null;
    });
    return row;
  });

  const colorStr = useSyncExternalStore(subscribeTheme, readThemeColors, () => SERVER_COLORS);
  const [primary, grid, axis] = colorStr.split("|");
  // Oldest → newest, shared with the 6-indicator radar so colors correspond.
  const lineColors = compareSeriesColors(series.length);

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
              fillOpacity={0.16}
              stroke={grid}
              strokeOpacity={0.35}
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
          {series.map((s, si) => (
            <Line
              key={si}
              type="monotone"
              dataKey={`s${si}`}
              stroke={lineColors[si] ?? primary}
              strokeWidth={2}
              strokeOpacity={si === series.length - 1 ? 1 : 0.8}
              isAnimationActive={false}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Which line is which measurement (oldest → newest). */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-1 text-xs text-text-secondary">
        {series.map((s, si) => (
          <span key={si} className="flex items-center gap-1.5">
            <span
              className="inline-block w-4 h-0.5 rounded"
              style={{ backgroundColor: lineColors[si] ?? primary }}
            />
            {s.label}
          </span>
        ))}
      </div>

      {/* Band colors ↔ wave types (matching the pie). */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-1 text-xs text-text-secondary">
        {SPECTRUM_BANDS.map((b) => (
          <span key={b.key} className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: b.color }}
            />
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
