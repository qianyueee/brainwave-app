"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { BrainProfile } from "@/lib/brain-profile";
import { INDICATOR_META } from "@/lib/brain-profile";
import { compositeScore } from "@/lib/brain-measurements";
import { THEME_CHANGE_EVENT } from "@/lib/theme";
import Fullscreenable from "@/components/Fullscreenable";

type MetricKey = "composite" | (typeof INDICATOR_META)[number]["key"];

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: "composite", label: "総合" },
  ...INDICATOR_META.map((m) => ({ key: m.key, label: m.shortLabel })),
];

function getThemeColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return val || fallback;
}

function metricValue(p: BrainProfile, key: MetricKey): number {
  return key === "composite" ? compositeScore(p.indicators) : p.indicators[key];
}

export default function BrainTrendChart({ measurements }: { measurements: BrainProfile[] }) {
  const [metric, setMetric] = useState<MetricKey>("composite");

  const [colors, setColors] = useState({
    primary: "#4a7fd4",
    accent: "#6b6baa",
    grid: "#162440",
    text: "#8890a8",
    bg: "#0e1a30",
    textPrimary: "#d0d8e8",
  });

  const readColors = useCallback(() => {
    setColors({
      primary: getThemeColor("--color-primary", "#4a7fd4"),
      accent: getThemeColor("--color-accent", "#6b6baa"),
      grid: getThemeColor("--color-navy-lighter", "#162440"),
      text: getThemeColor("--color-text-secondary", "#8890a8"),
      bg: getThemeColor("--color-navy-light", "#0e1a30"),
      textPrimary: getThemeColor("--color-text-primary", "#d0d8e8"),
    });
  }, []);

  useEffect(() => {
    readColors();
    window.addEventListener(THEME_CHANGE_EVENT, readColors);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, readColors);
  }, [readColors]);

  const data = measurements.map((m) => ({
    date: new Date(m.uploadedAt).toLocaleDateString("ja-JP", {
      month: "numeric",
      day: "numeric",
    }),
    value: metricValue(m, metric),
  }));

  const activeLabel = METRIC_OPTIONS.find((o) => o.key === metric)?.label ?? "";

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
      <p className="text-base font-bold text-text-primary mb-3">推移グラフ</p>

      {/* Metric selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {METRIC_OPTIONS.map((o) => {
          const active = o.key === metric;
          return (
            <button
              key={o.key}
              onClick={() => setMetric(o.key)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-white neu-press"
                  : "bg-navy text-text-secondary neu-raised-sm"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <Fullscreenable title={`推移グラフ・${activeLabel}`}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="date"
              tick={{ fill: colors.text, fontSize: 12 }}
              axisLine={{ stroke: colors.grid }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: colors.text, fontSize: 12 }}
              axisLine={{ stroke: colors.grid }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: colors.bg,
                border: `1px solid ${colors.grid}`,
                borderRadius: "12px",
                color: colors.textPrimary,
                fontSize: "14px",
                boxShadow: "4px 4px 10px rgba(0,0,0,0.4), -2px -2px 6px rgba(255,255,255,0.04)",
              }}
              formatter={(value: number | undefined) => [`${value ?? 0}`, activeLabel]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={colors.primary}
              strokeWidth={2}
              dot={{ fill: colors.primary, r: 4 }}
              activeDot={{ fill: colors.accent, r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Fullscreenable>
    </div>
  );
}
