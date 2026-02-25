"use client";

import { useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function SimpleCalendar() {
  const sessionLogs = useAppStore((s) => s.sessionLogs);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const logDates = useMemo(() => {
    const dates = new Set<string>();
    sessionLogs.forEach((log) => {
      const d = new Date(log.date);
      dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return dates;
  }, [sessionLogs]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthName = `${year}年${month + 1}月`;

  return (
    <div className="bg-navy rounded-3xl p-4 neu-raised">
      <p className="text-base font-bold text-text-primary mb-3">{monthName}</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-xs text-text-muted py-1">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          const hasLog =
            day !== null && logDates.has(`${year}-${month}-${day}`);
          const isToday = day === now.getDate();
          return (
            <div
              key={i}
              className={`relative py-2 text-sm rounded-lg ${
                isToday ? "text-primary font-bold neu-inset" : "text-text-secondary"
              }`}
            >
              {day ?? ""}
              {hasLog && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-accent" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
