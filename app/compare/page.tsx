"use client";

import { useState, useEffect } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { BrainProfile } from "@/lib/brain-profile";
import { compositeScore, scoreColor, measurementLabel } from "@/lib/brain-measurements";
import BrainSpectrumCompare from "@/components/BrainSpectrumCompare";
import BrainRadarCompare from "@/components/BrainRadarCompare";
import Fullscreenable from "@/components/Fullscreenable";
import SignalQualityBadge from "@/components/SignalQualityBadge";
import { CheckSquare, Square, X, Lock, GitCompareArrows } from "lucide-react";

function CompareCandidateRow({
  m,
  selected,
  onToggle,
}: {
  m: BrainProfile;
  selected: boolean;
  onToggle: (uploadedAt: string) => void;
}) {
  // Only measurements with a per-Hz spectrum can be compared.
  const selectable = Boolean(m.spectrum?.length);
  const total = compositeScore(m.indicators);

  return (
    <button
      onClick={() => onToggle(m.uploadedAt)}
      disabled={!selectable}
      aria-label={selected ? "選択を解除" : "比較に選択"}
      className={`w-full bg-surface border rounded-3xl p-4 flex items-center gap-3 text-left neu-raised transition-colors ${
        selected ? "border-primary" : "border-surface-border"
      } ${selectable ? "neu-press" : "opacity-50"}`}
    >
      {selectable && (
        <span className="shrink-0 text-primary">
          {selected ? <CheckSquare size={22} /> : <Square size={22} className="text-text-muted" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-text-primary">{measurementLabel(m)}</p>
        {m.subject && (
          <p className="text-sm font-bold text-primary truncate">{m.subject}</p>
        )}
        <p className="text-sm text-text-secondary truncate">{m.sessionTag}</p>
        <SignalQualityBadge qualityPct={m.qualityPct} className="mt-1" />
        {!selectable && (
          <p className="text-xs text-text-muted mt-1">比較対象外（スペクトルなし）</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p
          className="text-xl font-mono font-bold tabular-nums"
          style={{ color: scoreColor(total) }}
        >
          {total}
        </p>
        <p className="text-xs text-text-muted">総合</p>
      </div>
    </button>
  );
}

export default function ComparePage() {
  const measurements = useBrainProfileStore((s) => s.measurements);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);

  // Guard hydration mismatch from persisted measurements
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Up to three measurements picked (by uploadedAt) for the comparison.
  // Stale ids (measurements array replaced out-of-band on an account switch)
  // are simply ignored downstream — `picked` derives from the current
  // measurements, so a stale selection never drives wrong feedback and ages
  // out within a couple of picks via slice(-3).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-3)
    );

  // Newest first for the list
  const ordered = [...measurements].reverse();

  // The picked measurements (2–3), ordered oldest→newest for the chart.
  const picked = selectedIds
    .map((id) => measurements.find((m) => m.uploadedAt === id))
    .filter((m): m is BrainProfile => Boolean(m?.spectrum?.length))
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  const canCompare = picked.length >= 2;

  const compareSection = (
    <>
      {canCompare && (
        <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-base font-bold text-text-primary">測定の比較</p>
            <button
              onClick={() => setSelectedIds([])}
              aria-label="選択を解除"
              className="w-8 h-8 rounded-lg bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
            >
              <X size={18} />
            </button>
          </div>

          <div>
            <p className="text-sm font-medium text-text-secondary mb-1 text-center">6指標</p>
            <Fullscreenable title="6指標の比較">
              <BrainRadarCompare
                series={picked.map((m) => ({
                  indicators: m.indicators,
                  label: measurementLabel(m),
                }))}
              />
            </Fullscreenable>
          </div>

          <div>
            <p className="text-sm font-medium text-text-secondary mb-1 text-center">
              周波数スペクトル
            </p>
            <Fullscreenable title="周波数スペクトル比較">
              <BrainSpectrumCompare
                series={picked.map((m) => ({
                  spectrum: m.spectrum!,
                  label: measurementLabel(m),
                }))}
              />
            </Fullscreenable>
          </div>
        </div>
      )}
      {picked.length === 1 && (
        <p className="text-sm text-text-secondary text-center">
          もう1件選ぶと比較を表示します
        </p>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Sync Compare</h1>
        <p className="text-sm text-text-secondary mt-1">シンク・コンペア｜効果比較・変化</p>
        <p className="text-xs text-text-muted mt-1">
          周波数スペクトルのある測定を2〜3件選ぶと、スペクトルを比較できます
        </p>
      </div>

      {!hydrated ? null : !authLoading && !user ? (
        <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-navy flex items-center justify-center neu-inset">
            <Lock size={28} className="text-text-muted" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-text-secondary">
            ログインすると脳波データを記録・同期できます
          </p>
          <button
            onClick={() => openAuthModal("login")}
            className="h-12 px-8 rounded-2xl bg-primary text-white text-base font-bold active:scale-95 transition-all neu-raised neu-press"
          >
            ログイン
          </button>
        </div>
      ) : measurements.length === 0 ? (
        <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised">
          <div className="flex justify-center mb-4">
            <GitCompareArrows size={40} className="text-primary" strokeWidth={1.5} />
          </div>
          <p className="text-base font-bold text-text-primary mb-2">
            比較できる測定がまだありません
          </p>
          <p className="text-sm text-text-secondary">
            シンク・セッションで測定するか、レポートで脳波データをアップロードしてください。
          </p>
        </div>
      ) : (
        /* Mobile: list then comparison below. Desktop: candidates | comparison. */
        <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
          <div className="flex flex-col gap-3">
            {ordered.map((m) => (
              <CompareCandidateRow
                key={m.uploadedAt}
                m={m}
                selected={selectedIds.includes(m.uploadedAt)}
                onToggle={toggleSelect}
              />
            ))}
          </div>

          <div className="flex flex-col gap-6">{compareSection}</div>
        </div>
      )}
    </div>
  );
}
