"use client";

import { useEffect, useState } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { BrainIndicators } from "@/lib/brain-profile";
import { INDICATOR_META } from "@/lib/brain-profile";

interface BrainRadarChartProps {
  indicators: BrainIndicators;
  size?: "small" | "large";
}

function getThemeColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return val || fallback;
}

export default function BrainRadarChart({ indicators, size = "large" }: BrainRadarChartProps) {
  const data = INDICATOR_META.map((meta) => ({
    label: meta.shortLabel,
    value: indicators[meta.key],
  }));

  const isSmall = size === "small";
  const height = isSmall ? 180 : 280;

  const [colors, setColors] = useState({
    primary: "#4a7fd4",
    grid: "#1e3a5f",
    text: "#8890a8",
    muted: "#5c6478",
  });

  useEffect(() => {
    const update = () => {
      setColors({
        primary: getThemeColor("--color-primary", "#4a7fd4"),
        grid: getThemeColor("--color-navy-lighter", "#1e3a5f"),
        text: getThemeColor("--color-text-secondary", "#8890a8"),
        muted: getThemeColor("--color-text-muted", "#5c6478"),
      });
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius={isSmall ? "70%" : "75%"}>
        <PolarGrid stroke={colors.grid} />
        <PolarAngleAxis
          dataKey="label"
          tick={{ fill: colors.text, fontSize: isSmall ? 10 : 12 }}
        />
        {!isSmall && (
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
