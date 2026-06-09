"use client";

import { BatteryMedium, AlertTriangle } from "lucide-react";
import type { EegSample } from "@/lib/mind/types";
import { getQuadrant, QUADRANT_INFO } from "@/lib/mind/types";

export default function MindStatusText({ sample }: { sample: EegSample | null }) {
  if (!sample) {
    return (
      <div className="text-center py-2">
        <p className="text-lg text-text-secondary">データを待っています…</p>
      </div>
    );
  }

  if (sample.signal !== undefined && sample.signal > 50) {
    return (
      <div className="flex items-center justify-center gap-2 py-2 text-amber-400">
        <AlertTriangle size={22} />
        <p className="text-lg font-bold">ヘッドセットの装着を確認してください</p>
      </div>
    );
  }

  const info = QUADRANT_INFO[getQuadrant(sample.attention, sample.meditation)];

  return (
    <div className="text-center py-2">
      <p className="text-lg font-bold" style={{ color: info.color }}>
        {info.message}
      </p>
      <div className="flex items-center justify-center gap-3 mt-1 text-sm text-text-secondary">
        <span>{info.label}</span>
        {sample.battery !== undefined && (
          <span className="flex items-center gap-1">
            <BatteryMedium size={16} />
            {sample.battery}%
          </span>
        )}
      </div>
    </div>
  );
}
