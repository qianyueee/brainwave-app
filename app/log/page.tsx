"use client";

import { useAppStore } from "@/store/useAppStore";
import SimpleCalendar from "@/components/SimpleCalendar";
import BrainAgeChart from "@/components/BrainAgeChart";

export default function LogPage() {
  const sessionLogs = useAppStore((s) => s.sessionLogs);

  const totalSessions = sessionLogs.length;
  const totalMinutes = Math.round(
    sessionLogs.reduce((sum, log) => sum + log.duration, 0) / 60
  );

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      <div>
        <h1 className="text-2xl font-bold text-text-primary">セッションログ</h1>
        <p className="text-sm text-text-secondary mt-1">
          あなたのチューニング記録
        </p>
      </div>

      {/* Stats summary */}
      <div className="flex gap-3">
        <div className="flex-1 bg-navy rounded-3xl p-4 text-center neu-raised">
          <p className="text-2xl font-bold text-primary">{totalSessions}</p>
          <p className="text-xs text-text-muted mt-1">セッション</p>
        </div>
        <div className="flex-1 bg-navy rounded-3xl p-4 text-center neu-raised">
          <p className="text-2xl font-bold text-accent">{totalMinutes}</p>
          <p className="text-xs text-text-muted mt-1">合計（分）</p>
        </div>
      </div>

      <SimpleCalendar />
      <BrainAgeChart />
    </div>
  );
}
