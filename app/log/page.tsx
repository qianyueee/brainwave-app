"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { BrainProfile } from "@/lib/brain-profile";
import { compositeScore } from "@/lib/brain-measurements";
import SimpleCalendar from "@/components/SimpleCalendar";
import BrainTrendChart from "@/components/BrainTrendChart";
import BrainRadarChart from "@/components/BrainRadarChart";
import EegUploader from "@/components/EegUploader";
import { ChevronDown, Trash2, BrainCircuit, Lock } from "lucide-react";

function scoreColor(score: number): string {
  return score >= 70 ? "#22c55e" : score >= 40 ? "#f97316" : "#ef4444";
}

function MeasurementItem({
  m,
  onDelete,
}: {
  m: BrainProfile;
  onDelete: (uploadedAt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = compositeScore(m.indicators);
  const date = new Date(m.uploadedAt);

  return (
    <div className="bg-surface border border-surface-border rounded-3xl neu-raised overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <p className="text-base font-bold text-text-primary">
            {date.toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <p className="text-sm text-text-secondary truncate">{m.sessionTag}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p
              className="text-xl font-mono font-bold tabular-nums"
              style={{ color: scoreColor(total) }}
            >
              {total}
            </p>
            <p className="text-xs text-text-muted">総合</p>
          </div>
          <ChevronDown
            size={20}
            className={`text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-surface-border pt-3">
          <BrainRadarChart indicators={m.indicators} size="small" showScores />
          <button
            onClick={() => {
              if (window.confirm("この記録を削除しますか？")) onDelete(m.uploadedAt);
            }}
            className="self-end flex items-center gap-2 px-4 py-2 rounded-2xl bg-navy text-red-400 text-sm font-medium neu-raised-sm neu-press transition-transform"
          >
            <Trash2 size={16} /> 削除
          </button>
        </div>
      )}
    </div>
  );
}

export default function LogPage() {
  const sessionLogs = useAppStore((s) => s.sessionLogs);
  const measurements = useBrainProfileStore((s) => s.measurements);
  const deleteMeasurement = useBrainProfileStore((s) => s.deleteMeasurement);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);

  // Guard hydration mismatch from persisted measurements
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const totalSessions = sessionLogs.length;
  const totalMinutes = Math.round(
    sessionLogs.reduce((sum, log) => sum + log.duration, 0) / 60
  );

  // Newest first for the list
  const ordered = [...measurements].reverse();

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      <div>
        <h1 className="text-2xl font-bold text-text-primary">セッションログ</h1>
        <p className="text-sm text-text-secondary mt-1">あなたのチューニング記録</p>
      </div>

      {/* Mobile: single column. Desktop: stats+calendar | history side by side. */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
      <div className="flex flex-col gap-6">
      {/* Stats summary */}
      <div className="flex gap-3">
        <div className="flex-1 bg-surface border border-surface-border rounded-3xl p-4 text-center neu-raised">
          <p className="text-2xl font-bold text-primary">{totalSessions}</p>
          <p className="text-xs text-text-muted mt-1">セッション</p>
        </div>
        <div className="flex-1 bg-surface border border-surface-border rounded-3xl p-4 text-center neu-raised">
          <p className="text-2xl font-bold text-accent">{totalMinutes}</p>
          <p className="text-xs text-text-muted mt-1">合計（分）</p>
        </div>
      </div>

      <SimpleCalendar />
      </div>

      <div className="flex flex-col gap-6">
      {/* Brainwave measurement history */}
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-bold text-text-primary">脳波の記録</h2>
          <p className="text-sm text-text-secondary mt-1">測定ごとの6指標の推移</p>
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
              <BrainCircuit size={40} className="text-primary" strokeWidth={1.5} />
            </div>
            <p className="text-base font-bold text-text-primary mb-2">まだ記録がありません</p>
            <p className="text-sm text-text-secondary mb-6">
              脳波データをアップロードすると、ここに測定の履歴と推移が表示されます。
            </p>
            <EegUploader />
          </div>
        ) : (
          <>
            <BrainTrendChart measurements={measurements} />
            <div className="flex flex-col gap-3">
              {ordered.map((m) => (
                <MeasurementItem
                  key={m.uploadedAt}
                  m={m}
                  onDelete={(t) => {
                    deleteMeasurement(t).catch((err) => console.error(err));
                  }}
                />
              ))}
            </div>
            <EegUploader />
          </>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}
