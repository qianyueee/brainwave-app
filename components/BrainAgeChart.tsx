"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// Demo data for v1
const DEMO_DATA = [
  { day: "月", age: 58 },
  { day: "火", age: 56 },
  { day: "水", age: 55 },
  { day: "木", age: 53 },
  { day: "金", age: 52 },
  { day: "土", age: 50 },
  { day: "日", age: 49 },
];

function getThemeColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return val || fallback;
}

export default function BrainAgeChart() {
  const [colors, setColors] = useState({
    primary: "#4a7fd4",
    accent: "#6b6baa",
    grid: "#162440",
    text: "#8890a8",
    bg: "#0e1a30",
    textPrimary: "#d0d8e8",
  });

  useEffect(() => {
    const update = () => {
      setColors({
        primary: getThemeColor("--color-primary", "#4a7fd4"),
        accent: getThemeColor("--color-accent", "#6b6baa"),
        grid: getThemeColor("--color-navy-lighter", "#162440"),
        text: getThemeColor("--color-text-secondary", "#8890a8"),
        bg: getThemeColor("--color-navy-light", "#0e1a30"),
        textPrimary: getThemeColor("--color-text-primary", "#d0d8e8"),
      });
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
      <p className="text-base font-bold text-text-primary mb-1">脳年齢トレンド</p>
      <p className="text-xs text-text-muted mb-4">デモデータ</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={DEMO_DATA}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis
            dataKey="day"
            tick={{ fill: colors.text, fontSize: 12 }}
            axisLine={{ stroke: colors.grid }}
          />
          <YAxis
            domain={[40, 65]}
            tick={{ fill: colors.text, fontSize: 12 }}
            axisLine={{ stroke: colors.grid }}
            tickFormatter={(v: number) => `${v}歳`}
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
            formatter={(value: number | undefined) => [`${value ?? 0}歳`, "脳年齢"]}
          />
          <Line
            type="monotone"
            dataKey="age"
            stroke={colors.primary}
            strokeWidth={2}
            dot={{ fill: colors.primary, r: 4 }}
            activeDot={{ fill: colors.accent, r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
