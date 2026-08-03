"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { computeBrainConditionMetrics } from "@/lib/brain-metrics";
import { scoreColor } from "@/lib/brain-measurements";
import type { BrainProfile } from "@/lib/brain-profile";

interface BrainConditionMetricsProps {
  /**
   * 指定時はこの測定から算出（Sync Report で表示中の測定）。省略時はストアの
   * 最新測定 — ホームと Sync Report は同じストア・同じ計算式を通るので、
   * 最新表示どうしの数値は常に一致する。
   */
  profile?: BrainProfile | null;
  /** タイルを /brain（測定）へのリンクにする（ホーム用）。Report ページ内では false。 */
  asLink?: boolean;
}

/**
 * 脳コンディション 3指標タイル。ホームでは最新測定＋タップで Sync Brain（測定）へ、
 * Sync Report の脳特性エリアでは表示中の測定を静的タイルで示す。
 */
export default function BrainConditionMetrics({
  profile: profileProp,
  asLink = true,
}: BrainConditionMetricsProps) {
  const storeProfile = useBrainProfileStore((s) => s.profile);
  const external = profileProp !== undefined;

  // Guard hydration mismatch from the persisted profile (store mode only —
  // an externally supplied profile is already gated by the caller).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const ready = external || hydrated;
  const profile = external ? (profileProp ?? null) : hydrated ? storeProfile : null;
  const metrics = computeBrainConditionMetrics(profile);
  const hasAnyScore = metrics.some((m) => m.score != null);

  const tiles = metrics.map((m) => {
    const inner = (
      <>
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
      </>
    );
    const className =
      "bg-surface border border-surface-border rounded-2xl px-2 py-4 flex flex-col items-center gap-1 text-center neu-raised" +
      (asLink ? " neu-press transition-transform breathe" : "");
    return asLink ? (
      <Link key={m.key} href="/brain" title={m.fullName} className={className}>
        {inner}
      </Link>
    ) : (
      <div key={m.key} title={m.fullName} className={className}>
        {inner}
      </div>
    );
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">脳コンディション</p>
      <div className={`grid grid-cols-3 gap-3${asLink ? " breathe-stagger" : ""}`}>{tiles}</div>
      {asLink && ready && !hasAnyScore && (
        <p className="text-xs text-text-muted text-center">
          測定するとスコアが表示されます（タップで測定へ）
        </p>
      )}
    </div>
  );
}
