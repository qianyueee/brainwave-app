"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { BrainProfile } from "@/lib/brain-profile";
import { compositeScore } from "@/lib/brain-measurements";
import SimpleCalendar from "@/components/SimpleCalendar";
import BrainTrendChart from "@/components/BrainTrendChart";
import BrainRadarChart from "@/components/BrainRadarChart";
import BrainSpectrumCompare from "@/components/BrainSpectrumCompare";
import Fullscreenable from "@/components/Fullscreenable";
import EegUploader from "@/components/EegUploader";
import { syncNoteFromMeasurement } from "@/lib/mind/note-sync";
import { ChevronDown, Trash2, BrainCircuit, Lock, CheckSquare, Square, X, BarChart3, Pencil, StickyNote } from "lucide-react";

function scoreColor(score: number): string {
  return score >= 70 ? "#22c55e" : score >= 40 ? "#f97316" : "#ef4444";
}

/** Max length of a measurement memo (matches the mind-map list). */
const NOTE_MAX = 200;

/** Short date-time label for a measurement, e.g. "7月13日 17:50". */
function measurementLabel(m: BrainProfile): string {
  return new Date(m.uploadedAt).toLocaleString("ja-JP", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MeasurementItem({
  m,
  onDelete,
  onView,
  selectable,
  selected,
  onToggleSelect,
}: {
  m: BrainProfile;
  onDelete: (uploadedAt: string) => void;
  /** Open this measurement on the 脳特性 page. */
  onView: (uploadedAt: string) => void;
  /** Only measurements with a spectrum can be picked for the Hz comparison. */
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (uploadedAt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState("");
  const total = compositeScore(m.indicators);
  const date = new Date(m.uploadedAt);

  return (
    <div
      className={`bg-surface border rounded-3xl neu-raised overflow-hidden transition-colors ${
        selected ? "border-primary" : "border-surface-border"
      }`}
    >
      <div className="flex items-center gap-1">
        {selectable && (
          <button
            onClick={() => onToggleSelect(m.uploadedAt)}
            aria-label={selected ? "選択を解除" : "比較に選択"}
            className="shrink-0 pl-3 pr-1 py-4 flex items-center text-primary"
          >
            {selected ? <CheckSquare size={22} /> : <Square size={22} className="text-text-muted" />}
          </button>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 flex items-center justify-between gap-3 p-4 text-left"
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
      </div>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-surface-border pt-3">
          <Fullscreenable title={measurementLabel(m)}>
            <BrainRadarChart indicators={m.indicators} size="small" showScores />
          </Fullscreenable>

          {/* Memo — kept in sync with the mind-map session's memo. */}
          {editingNote ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                maxLength={NOTE_MAX}
                autoFocus
                placeholder="メモを入力…（体調・気分・状況など）"
                className="w-full rounded-xl bg-navy neu-inset p-3 text-sm text-text-primary placeholder:text-text-muted resize-none outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted tabular-nums">
                  {draft.length}/{NOTE_MAX}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingNote(false)}
                    className="px-4 py-2 rounded-xl bg-navy text-text-secondary text-sm font-medium neu-raised-sm neu-press transition-transform"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={() => {
                      syncNoteFromMeasurement(m.uploadedAt, draft);
                      setEditingNote(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold neu-raised-sm neu-press transition-transform"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          ) : m.note ? (
            <button
              onClick={() => {
                setDraft(m.note ?? "");
                setEditingNote(true);
              }}
              className="w-full text-left flex items-start gap-2 rounded-xl bg-navy neu-inset p-3 active:opacity-70"
            >
              <StickyNote size={16} className="shrink-0 mt-0.5 text-text-muted" />
              <span className="flex-1 text-sm text-text-secondary whitespace-pre-wrap break-words">
                {m.note}
              </span>
              <Pencil size={14} className="shrink-0 mt-0.5 text-text-muted" />
            </button>
          ) : (
            <button
              onClick={() => {
                setDraft("");
                setEditingNote(true);
              }}
              className="self-start flex items-center gap-1.5 text-sm text-text-muted active:opacity-70"
            >
              <Pencil size={14} /> メモを追加
            </button>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => onView(m.uploadedAt)}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-primary text-white text-sm font-bold neu-raised-sm neu-press transition-transform"
            >
              <BarChart3 size={16} /> 脳特性で見る
            </button>
            <button
              onClick={() => {
                if (window.confirm("この記録を削除しますか？")) onDelete(m.uploadedAt);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-navy text-red-400 text-sm font-medium neu-raised-sm neu-press transition-transform"
            >
              <Trash2 size={16} /> 削除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LogPage() {
  const router = useRouter();
  const sessionLogs = useAppStore((s) => s.sessionLogs);
  const measurements = useBrainProfileStore((s) => s.measurements);
  const deleteMeasurement = useBrainProfileStore((s) => s.deleteMeasurement);
  const setViewingMeasurement = useBrainProfileStore((s) => s.setViewingMeasurement);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);

  const viewOnProfile = (uploadedAt: string) => {
    setViewingMeasurement(uploadedAt);
    router.push("/profile");
  };

  // Guard hydration mismatch from persisted measurements
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Desktop (md+) shows the spectrum comparison below the calendar; mobile keeps
  // it below the record list. Tracked so only one instance mounts (no 0-width
  // chart in a hidden container).
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Up to three measurements picked (by uploadedAt) for the Hz spectrum compare.
  // Stale ids (measurements array replaced out-of-band on an account switch)
  // are simply ignored downstream — `picked` and the hint derive from the
  // current measurements, so a stale selection never drives wrong feedback and
  // ages out within a couple of picks via slice(-3).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-3)
    );

  const totalSessions = sessionLogs.length;
  const totalMinutes = Math.round(
    sessionLogs.reduce((sum, log) => sum + log.duration, 0) / 60
  );

  // Newest first for the list
  const ordered = [...measurements].reverse();

  // How many measurements carry a per-Hz spectrum (only those are comparable).
  const spectrumCount = measurements.filter((m) => m.spectrum?.length).length;

  // The picked measurements (2–3), ordered oldest→newest for the chart.
  const picked = selectedIds
    .map((id) => measurements.find((m) => m.uploadedAt === id))
    .filter((m): m is BrainProfile => Boolean(m?.spectrum?.length))
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  const canCompare = picked.length >= 2;

  // Comparison block (card + hint), placed responsively (desktop: under the
  // calendar; mobile: under the record list) — rendered in one slot only.
  const compareSection =
    hydrated && user && measurements.length > 0 ? (
      <>
        {canCompare && (
          <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
            <div className="flex items-center justify-between mb-2">
              <p className="text-base font-bold text-text-primary">周波数スペクトル比較</p>
              <button
                onClick={() => setSelectedIds([])}
                aria-label="選択を解除"
                className="w-8 h-8 rounded-lg bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
              >
                <X size={18} />
              </button>
            </div>
            <Fullscreenable title="周波数スペクトル比較">
              <BrainSpectrumCompare
                series={picked.map((m) => ({
                  spectrum: m.spectrum!,
                  label: measurementLabel(m),
                }))}
              />
            </Fullscreenable>
          </div>
        )}
        {picked.length === 1 && (
          <p className="text-sm text-text-secondary text-center">
            もう1件選ぶと比較を表示します
          </p>
        )}
      </>
    ) : null;

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

      {/* Desktop: comparison sits under the calendar (the date section). */}
      {isDesktop && compareSection}
      </div>

      <div className="flex flex-col gap-6">
      {/* Brainwave measurement history */}
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-bold text-text-primary">脳波の記録</h2>
          <p className="text-sm text-text-secondary mt-1">測定ごとの6指標の推移</p>
          {hydrated && spectrumCount >= 2 && (
            <p className="text-xs text-text-muted mt-1">
              周波数スペクトルのある測定を2〜3件選ぶと、スペクトルを比較できます
            </p>
          )}
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
                    setSelectedIds((prev) => prev.filter((x) => x !== t));
                    deleteMeasurement(t).catch((err) => console.error(err));
                  }}
                  onView={viewOnProfile}
                  selectable={Boolean(m.spectrum?.length)}
                  selected={selectedIds.includes(m.uploadedAt)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>

            {/* Mobile: comparison sits under the record list. */}
            {!isDesktop && compareSection}

            <EegUploader />
          </>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}
