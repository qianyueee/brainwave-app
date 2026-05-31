"use client";

import { useMemo, useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function SimpleCalendar() {
  const sessionLogs = useAppStore((s) => s.sessionLogs);
  const measurements = useBrainProfileStore((s) => s.measurements);

  // Persisted measurements aren't available on the server / first paint;
  // gate their dots behind mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const logDates = useMemo(() => {
    const dates = new Set<string>();
    sessionLogs.forEach((log) => dates.add(dayKey(new Date(log.date))));
    return dates;
  }, [sessionLogs]);

  const measureDates = useMemo(() => {
    const dates = new Set<string>();
    measurements.forEach((m) => dates.add(dayKey(new Date(m.uploadedAt))));
    return dates;
  }, [measurements]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthName = `${year}年${month + 1}月`;

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
      <p className="text-base font-bold text-text-primary mb-3">{monthName}</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-xs text-text-muted py-1">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          const key = day !== null ? `${year}-${month}-${day}` : "";
          const hasLog = day !== null && logDates.has(key);
          const hasMeasure = mounted && day !== null && measureDates.has(key);
          const isToday = day === now.getDate();
          return (
            <div
              key={i}
              className={`relative py-2 text-sm rounded-lg ${
                isToday ? "text-primary font-bold neu-inset" : "text-text-secondary"
              }`}
            >
              {day ?? ""}
              {(hasLog || hasMeasure) && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {hasLog && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                  {hasMeasure && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-4 mt-3 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          セッション
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          脳波測定
        </span>
      </div>
    </div>
  );
}
