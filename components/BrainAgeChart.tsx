"use client";

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

export default function BrainAgeChart() {
  return (
    <div className="bg-navy-light rounded-2xl p-4">
      <p className="text-base font-bold text-text-primary mb-1">脳年齢トレンド</p>
      <p className="text-xs text-text-muted mb-4">デモデータ</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={DEMO_DATA}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" />
          <XAxis
            dataKey="day"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={{ stroke: "#1e2d4a" }}
          />
          <YAxis
            domain={[40, 65]}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={{ stroke: "#1e2d4a" }}
            tickFormatter={(v: number) => `${v}歳`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#142038",
              border: "1px solid #1e2d4a",
              borderRadius: "8px",
              color: "#f1f5f9",
              fontSize: "14px",
            }}
            formatter={(value: number | undefined) => [`${value ?? 0}歳`, "脳年齢"]}
          />
          <Line
            type="monotone"
            dataKey="age"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: "#3b82f6", r: 4 }}
            activeDot={{ fill: "#f97316", r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
