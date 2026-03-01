"use client";

import { CloudSun } from "lucide-react";

export default function BrainWeather() {
  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-5 text-center neu-raised breathe">
      <p className="text-sm text-text-secondary mb-2">今日の脳のお天気</p>
      <div className="flex justify-center mb-2">
        <CloudSun size={40} className="text-primary" strokeWidth={1.5} />
      </div>
      <p className="text-lg font-bold text-text-primary">おおむね快晴</p>
      <p className="text-xs text-text-muted mt-1">
        脳波データ取得後にパーソナライズされます
      </p>
    </div>
  );
}
