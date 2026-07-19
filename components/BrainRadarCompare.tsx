"use client";

import { useSyncExternalStore } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import type { BrainIndicators } from "@/lib/brain-profile";
import { INDICATOR_META } from "@/lib/brain-profile";
import { compareSeriesColors } from "@/lib/compare-colors";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

export interface RadarSeries {
  indicators: BrainIndicators;
  label: string;
}

const SERVER_COLORS = "#1e3a5f|#8890a8|#8890a8|#4a7fd4"; // grid|text|muted|primary

function readThemeColors(): string {
  if (typeof window === "undefined") return SERVER_COLORS;
  const get = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  return [
    get("--color-navy-lighter", "#1e3a5f"),
    get("--color-text-secondary", "#8890a8"),
    get("--color-text-muted", "#8890a8"),
    get("--color-primary", "#4a7fd4"),
  ].join("|");
}

function subscribeTheme(cb: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, cb);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, cb);
}

/**
 * Overlays the 6 indicators of 2–3 measurements on one radar, oldest→newest,
 * using the same per-series colors as BrainSpectrumCompare so the two charts
 * correspond. Outline-forward (light fill) so the overlapping shapes stay
 * readable; a legend maps each color to its measurement.
 */
export default function BrainRadarCompare({ series }: { series: RadarSeries[] }) {
  const colorStr = useSyncExternalStore(subscribeTheme, readThemeColors, () => SERVER_COLORS);
  const [grid, text, , primary] = colorStr.split("|");

  const lineColors = compareSeriesColors(series.length);

  const data = INDICATOR_META.map((meta) => {
    const row: Record<string, string | number> = { label: meta.shortLabel };
    series.forEach((s, i) => {
      row[`s${i}`] = s.indicators[meta.key];
    });
    return row;
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="66%">
          <PolarGrid stroke={grid} />
          <PolarAngleAxis dataKey="label" tick={{ fill: text, fontSize: 11 }} />
          {series.map((s, i) => (
            <Radar
              key={i}
              dataKey={`s${i}`}
              stroke={lineColors[i] ?? primary}
              fill={lineColors[i] ?? primary}
              fillOpacity={0.08}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-1 text-xs text-text-secondary">
        {series.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span
              className="inline-block w-4 h-0.5 rounded"
              style={{ backgroundColor: lineColors[i] ?? primary }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
