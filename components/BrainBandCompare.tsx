"use client";

import { useSyncExternalStore } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { BandPowers } from "@/lib/mind/types";
import { BAND_META } from "@/lib/mind/types";
import { BAND_COLORS } from "./BrainBandPie";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

const SERVER_COLORS = "#1e3a5f|#8890a8|#8890a8";

/** Read the theme's grid/axis/before-bar colors as one stable "a|b|c" string,
 *  re-read on the theme-change event. Returning a primitive keeps
 *  useSyncExternalStore from looping and avoids setState-in-effect. */
function readThemeColors(): string {
  if (typeof window === "undefined") return SERVER_COLORS;
  const get = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  return [
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
 * Before/after comparison of the 8-band balance: grey bars = the previous
 * measurement (体験前), colored bars = the latest (体験後), one pair per band in
 * ascending frequency order. Mirrors the "体験前後の脳波" spectrum idea within
 * our data's resolution — values are each measurement's relative power (%), so
 * they compare the balance shift, not absolute μV amplitude.
 */
export default function BrainBandCompare({
  before,
  after,
}: {
  before: BandPowers;
  after: BandPowers;
}) {
  const data = BAND_META.map((b) => ({
    key: b.key,
    name: b.ja,
    before: Math.round(before[b.key] * 10) / 10,
    after: Math.round(after[b.key] * 10) / 10,
  }));

  const colorStr = useSyncExternalStore(subscribeTheme, readThemeColors, () => SERVER_COLORS);
  const [gridColor, axisColor, beforeColor] = colorStr.split("|");
  const colors = { grid: gridColor, axis: axisColor, before: beforeColor };

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
          barGap={1}
          barCategoryGap="24%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: colors.axis, fontSize: 10 }}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: colors.grid }}
          />
          <YAxis
            unit="%"
            tick={{ fill: colors.axis, fontSize: 10 }}
            width={44}
            tickLine={false}
            axisLine={{ stroke: colors.grid }}
          />
          <Bar dataKey="before" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={colors.before} fillOpacity={0.45} />
            ))}
          </Bar>
          <Bar dataKey="after" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={BAND_COLORS[d.key]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-center gap-5 mt-1 text-xs text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: colors.before, opacity: 0.45 }}
          />
          体験前（前回）
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ background: "linear-gradient(90deg,#38bdf8,#fb923c,#d946ef)" }}
          />
          体験後（今回）
        </span>
      </div>
    </div>
  );
}
