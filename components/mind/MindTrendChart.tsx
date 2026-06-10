"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { EegSample } from "@/lib/mind/types";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

function getThemeColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return val || fallback;
}

export default function MindTrendChart({ history }: { history: EegSample[] }) {
  const [colors, setColors] = useState({
    primary: "#4a7fd4",
    accent: "#6b6baa",
    grid: "#162440",
    text: "#8890a8",
  });

  const readColors = useCallback(() => {
    setColors({
      primary: getThemeColor("--color-primary", "#4a7fd4"),
      accent: getThemeColor("--color-accent", "#6b6baa"),
      grid: getThemeColor("--color-navy-lighter", "#162440"),
      text: getThemeColor("--color-text-secondary", "#8890a8"),
    });
  }, []);

  useEffect(() => {
    readColors();
    window.addEventListener(THEME_CHANGE_EVENT, readColors);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, readColors);
  }, [readColors]);

  const data = history.map((s) => ({
    time: new Date(s.ts).toLocaleTimeString("ja-JP", {
      minute: "2-digit",
      second: "2-digit",
    }),
    attention: s.attention,
    meditation: s.meditation,
  }));

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
      <div className="flex items-center justify-between mb-3">
        <p className="text-base font-bold text-text-primary">推移（直近5分）</p>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 text-text-secondary">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: colors.primary }}
            />
            集中
          </span>
          <span className="flex items-center gap-1.5 text-text-secondary">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: colors.accent }}
            />
            リラックス
          </span>
        </div>
      </div>

      {data.length < 2 ? (
        <p className="text-base text-text-secondary text-center py-8">
          データを集めています…
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="time"
              tick={{ fill: colors.text, fontSize: 12 }}
              axisLine={{ stroke: colors.grid }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: colors.text, fontSize: 12 }}
              axisLine={{ stroke: colors.grid }}
            />
            <Line
              type="monotone"
              dataKey="attention"
              stroke={colors.primary}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="meditation"
              stroke={colors.accent}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
