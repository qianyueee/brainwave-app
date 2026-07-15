"use client";

import { useCallback, useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import type { BandPowers } from "@/lib/mind/types";
import { BAND_META } from "@/lib/mind/types";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

/** Distinct color per band (gamma = magenta/purple, matching the equalizer accent). */
export const BAND_COLORS: Record<string, string> = {
  delta: "#94a3b8",
  theta: "#fcd34d",
  lowAlpha: "#38bdf8",
  highAlpha: "#3b82f6",
  lowBeta: "#fdba74",
  highBeta: "#fb923c",
  lowGamma: "#d946ef",
  highGamma: "#a855f7",
};

const RAD = Math.PI / 180;

/** 8-band brainwave balance as a labelled pie chart (% of total power). */
export default function BrainBandPie({ powers }: { powers: BandPowers }) {
  const data = BAND_META.map((b) => ({ key: b.key, name: b.ja, value: powers[b.key] }));

  const [labelColor, setLabelColor] = useState("#8890a8");
  const readColor = useCallback(() => {
    if (typeof window === "undefined") return;
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-text-secondary")
      .trim();
    setLabelColor(v || "#8890a8");
  }, []);
  useEffect(() => {
    readColor();
    window.addEventListener(THEME_CHANGE_EVENT, readColor);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, readColor);
  }, [readColor]);

  const renderLabel = (p: PieLabelRenderProps) => {
    const cx = Number(p.cx);
    const cy = Number(p.cy);
    const midAngle = Number(p.midAngle);
    const outerRadius = Number(p.outerRadius);
    const value = Number(p.value);
    const name = String(p.name ?? "");
    if (!Number.isFinite(value) || value <= 0) return null;
    const r = outerRadius + 16;
    const x = cx + r * Math.cos(-midAngle * RAD);
    const y = cy + r * Math.sin(-midAngle * RAD);
    return (
      <text
        x={x}
        y={y}
        fill={labelColor}
        fontSize={11}
        textAnchor={x >= cx ? "start" : "end"}
        dominantBaseline="central"
      >
        {name} {value.toFixed(1)}%
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius="62%"
          // Start Delta at 12 o'clock and run clockwise through the 8 bands
          // (Delta → … → Mid-Gamma), matching the reference layout.
          startAngle={90}
          endAngle={-270}
          label={renderLabel}
          labelLine={{ stroke: labelColor, strokeWidth: 1 }}
          isAnimationActive={false}
        >
          {data.map((d) => (
            <Cell key={d.key} stroke="transparent" fill={BAND_COLORS[d.key]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
