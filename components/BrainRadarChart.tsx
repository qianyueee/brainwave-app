"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { BaseTickContentProps } from "recharts";
import type { BrainIndicators } from "@/lib/brain-profile";
import { INDICATOR_META } from "@/lib/brain-profile";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

interface BrainRadarChartProps {
  indicators: BrainIndicators;
  size?: "small" | "large";
  /** Render each indicator's score under its axis label. */
  showScores?: boolean;
}

function getThemeColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return val || fallback;
}

function scoreColor(score: number): string {
  return score >= 70 ? "#22c55e" : score >= 40 ? "#f97316" : "#ef4444";
}

export default function BrainRadarChart({
  indicators,
  size = "large",
  showScores = false,
}: BrainRadarChartProps) {
  const data = INDICATOR_META.map((meta) => ({
    label: meta.shortLabel,
    value: indicators[meta.key],
  }));
  const scoreByLabel: Record<string, number> = {};
  for (const d of data) scoreByLabel[d.label] = d.value;

  const isSmall = size === "small";
  const height = isSmall ? (showScores ? 230 : 180) : showScores ? 320 : 280;

  const [colors, setColors] = useState({
    primary: "#4a7fd4",
    grid: "#1e3a5f",
    text: "#8890a8",
    strong: "#d0d8e8",
    muted: "#5c6478",
  });

  const readColors = useCallback(() => {
    setColors({
      primary: getThemeColor("--color-primary", "#4a7fd4"),
      grid: getThemeColor("--color-navy-lighter", "#1e3a5f"),
      text: getThemeColor("--color-text-secondary", "#8890a8"),
      strong: getThemeColor("--color-text-primary", "#d0d8e8"),
      muted: getThemeColor("--color-text-muted", "#5c6478"),
    });
  }, []);

  useEffect(() => {
    readColors();
    window.addEventListener(THEME_CHANGE_EVENT, readColors);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, readColors);
  }, [readColors]);

  // Custom tick: indicator name with its score on a second line.
  const renderTick = (props: BaseTickContentProps) => {
    const { x, y, textAnchor, payload } = props;
    const label = String(payload?.value ?? "");
    const score = scoreByLabel[label] ?? 0;
    return (
      <text x={x} y={y} textAnchor={textAnchor} fill={colors.text}>
        <tspan x={x} dy="-2" fontSize={isSmall ? 10 : 12}>
          {label}
        </tspan>
        <tspan
          x={x}
          dy={isSmall ? 15 : 17}
          fontSize={isSmall ? 13 : 15}
          fontWeight={700}
          fill={scoreColor(score)}
        >
          {score}
        </tspan>
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart
        data={data}
        cx="50%"
        cy="50%"
        outerRadius={isSmall ? (showScores ? "58%" : "70%") : showScores ? "62%" : "75%"}
      >
        <PolarGrid stroke={colors.grid} />
        <PolarAngleAxis
          dataKey="label"
          tick={
            showScores
              ? renderTick
              : { fill: colors.text, fontSize: isSmall ? 10 : 12 }
          }
        />
        {!isSmall && !showScores && (
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: colors.muted, fontSize: 10 }}
            tickCount={5}
          />
        )}
        <Radar
          dataKey="value"
          stroke={colors.primary}
          fill={colors.primary}
          fillOpacity={0.25}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
