"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { BandPowers } from "@/lib/mind/types";
import { BAND_META, BAND_COLORS } from "@/lib/mind/types";

/**
 * 8-band brainwave balance: a colored pie (Delta at 12 o'clock, clockwise) with
 * a two-column legend below (swatch · name · %). The legend replaces on-slice
 * labels so the values stay large and never overlap on the tiny γ slices.
 */
export default function BrainBandPie({ powers }: { powers: BandPowers }) {
  const data = BAND_META.map((b) => ({ key: b.key, name: b.ja, value: powers[b.key] }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius="82%"
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={BAND_COLORS[d.key]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 gap-x-5 gap-y-2 mt-3 px-1">
        {data.map((d) => (
          <div key={d.key} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: BAND_COLORS[d.key] }}
            />
            <span className="flex-1 min-w-0 truncate text-text-secondary">{d.name}</span>
            <span className="font-mono tabular-nums font-bold text-text-primary">
              {d.value.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
