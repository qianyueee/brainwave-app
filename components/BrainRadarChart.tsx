"use client";

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

export default function BrainRadarChart({ indicators, size = "large" }: BrainRadarChartProps) {
  const data = INDICATOR_META.map((meta) => ({
    label: meta.shortLabel,
    value: indicators[meta.key],
  }));

  const isSmall = size === "small";
  const height = isSmall ? 180 : 280;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius={isSmall ? "70%" : "75%"}>
        <PolarGrid stroke="#1e3a5f" />
        <PolarAngleAxis
          dataKey="label"
          tick={{ fill: "#94a3b8", fontSize: isSmall ? 10 : 12 }}
        />
        {!isSmall && (
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "#64748b", fontSize: 10 }}
            tickCount={5}
          />
        )}
        <Radar
          dataKey="value"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.25}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
