"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { computeBrainConditionMetrics } from "@/lib/brain-metrics";
import { scoreColor } from "@/lib/brain-measurements";

/**
 * 脳コンディション 3指標タイル（旧 MoodSelector の位置）。最新測定から
 * 若々しさ / 活性化度 / リフレッシュ度を算出し、タップで Sync Report へ。
 */
export default function BrainConditionMetrics() {
  const profile = useBrainProfileStore((s) => s.profile);

  // Guard hydration mismatch from the persisted profile
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const metrics = computeBrainConditionMetrics(hydrated ? profile : null);
  const hasAnyScore = metrics.some((m) => m.score != null);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">脳コンディション</p>
      <div className="grid grid-cols-3 gap-3 breathe-stagger">
        {metrics.map((m) => (
          <Link
            key={m.key}
            href="/report"
            title={m.fullName}
            className="bg-surface border border-surface-border rounded-2xl px-2 py-4 flex flex-col items-center gap-1 text-center neu-raised neu-press transition-transform breathe"
          >
            <span
              className="text-3xl font-mono font-bold tabular-nums leading-none"
              style={{ color: m.score != null ? scoreColor(m.score) : "var(--dyn-text-muted)" }}
            >
              {m.score != null ? m.score : "—"}
            </span>
            <span className="text-sm font-bold text-text-primary leading-tight mt-1">
              {m.title}
            </span>
            <span className="text-xs text-text-muted leading-tight">{m.subtitle}</span>
          </Link>
        ))}
      </div>
      {hydrated && !hasAnyScore && (
        <p className="text-xs text-text-muted text-center">
          測定するとスコアが表示されます（タップで測定へ）
        </p>
      )}
    </div>
  );
}
