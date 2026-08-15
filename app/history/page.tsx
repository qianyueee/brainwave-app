"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useSubjectStore, activeSubject } from "@/store/useSubjectStore";
import type { BrainProfile } from "@/lib/brain-profile";
import { compositeScore, scoreColor, measurementLabel } from "@/lib/brain-measurements";
import {
  ALL_SUBJECTS,
  matchesSubject,
  resolveSubjectKey,
  subjectGroups,
} from "@/lib/subject-groups";
import SimpleCalendar from "@/components/SimpleCalendar";
import BrainTrendChart from "@/components/BrainTrendChart";
import BrainRadarChart from "@/components/BrainRadarChart";
import Fullscreenable from "@/components/Fullscreenable";
import EegUploader from "@/components/EegUploader";
import SignalQualityBadge from "@/components/SignalQualityBadge";
import SelectDropdown, { type SelectOption } from "@/components/SelectDropdown";
import { syncNoteFromMeasurement } from "@/lib/mind/note-sync";
import { PLACEHOLDER_TREE, formatTreeDate } from "@/lib/sync-tree";
import { Trash2, BrainCircuit, Lock, BarChart3, Pencil, StickyNote, User, CalendarClock, TreeDeciduous } from "lucide-react";

/** Max length of a measurement memo (matches the mind-map list). */
const NOTE_MAX = 200;

/**
 * The measurement chosen in the 記録 dropdown, shown in full. Not collapsible —
 * the dropdown above already answers "which one", so there is exactly one card
 * and it is always open.
 */
function MeasurementDetail({
  m,
  showSubject,
  onDelete,
  onView,
}: {
  m: BrainProfile;
  /** Whose record this is — worth showing once the history mixes people. */
  showSubject: boolean;
  onDelete: (uploadedAt: string) => void;
  /** Open this measurement on the Sync Report page (脳特性チャート). */
  onView: (uploadedAt: string) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState("");
  const total = compositeScore(m.indicators);
  const date = new Date(m.uploadedAt);

  return (
    <div className="bg-surface border border-surface-border rounded-3xl neu-raised p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-text-primary">
            {date.toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          {showSubject && m.subject && (
            <p className="text-sm font-bold text-primary truncate">{m.subject}</p>
          )}
          <p className="text-sm text-text-secondary truncate">{m.sessionTag}</p>
          <SignalQualityBadge qualityPct={m.qualityPct} className="mt-1" />
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
      </div>

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
                className="min-h-12 px-4 py-2 rounded-xl bg-navy text-text-secondary text-sm font-medium neu-raised-sm neu-press transition-transform"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  syncNoteFromMeasurement(m.uploadedAt, draft);
                  setEditingNote(false);
                }}
                className="min-h-12 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold neu-raised-sm neu-press transition-transform"
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
          className="flex items-center gap-2 min-h-12 px-4 py-2 rounded-2xl bg-primary text-on-primary text-sm font-bold neu-raised-sm neu-press transition-transform"
        >
          <BarChart3 size={16} /> レポートで見る
        </button>
        <button
          onClick={() => {
            if (window.confirm("この記録を削除しますか？")) onDelete(m.uploadedAt);
          }}
          className="flex items-center gap-2 min-h-12 px-4 py-2 rounded-2xl bg-navy text-danger text-sm font-medium neu-raised-sm neu-press transition-transform"
        >
          <Trash2 size={16} /> 削除
        </button>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const sessionLogs = useAppStore((s) => s.sessionLogs);
  const measurements = useBrainProfileStore((s) => s.measurements);
  const deleteMeasurement = useBrainProfileStore((s) => s.deleteMeasurement);
  const setViewingMeasurement = useBrainProfileStore((s) => s.setViewingMeasurement);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const subject = useSubjectStore(activeSubject);

  const viewOnReport = (uploadedAt: string) => {
    setViewingMeasurement(uploadedAt);
    router.push("/report");
  };

  // Guard hydration mismatch from persisted measurements
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const [subjectKey, setSubjectKey] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);

  const totalSessions = sessionLogs.length;
  const totalMinutes = Math.round(
    sessionLogs.reduce((sum, log) => sum + log.duration, 0) / 60
  );

  // Sync Tree はまだプレースホルダ（成長ロジック未実装）。統計タイルと記録
  // カードは同じ固定値を読むので、ホームのバーとも数字が食い違わない。
  const completedTrees = PLACEHOLDER_TREE.completed;
  const grownTrees = completedTrees.length;

  // Newest first for the pickers (`measurements` is oldest→newest).
  const ordered = [...measurements].reverse();

  // ── 測定者 → 記録 の2段選択 ──
  // Grouped by the name stored on each record (a measurement keeps the name, not
  // an id, so it stays readable after a rename), most recently measured first.
  const groups = hydrated
    ? subjectGroups(ordered, (m) => ({ key: m.subject, name: m.subject }))
    : [];
  // Defaults to whoever is being measured on Sync Brain, else the latest record.
  const activeKey = resolveSubjectKey(subjectKey, groups, subject?.name);
  const showAll = activeKey === ALL_SUBJECTS;

  // Oldest→newest for the trend chart, newest-first for the dropdown. Only one
  // person's records feed the trend: a curve drawn through several people's
  // measurements is not a trend.
  const forSubject = activeKey
    ? measurements.filter((m) => matchesSubject({ key: m.subject }, activeKey))
    : [];
  const orderedForSubject = [...forSubject].reverse();

  // A stale pick (record deleted, subject switched) falls back to the newest.
  const selected =
    orderedForSubject.find((m) => m.uploadedAt === recordId) ?? orderedForSubject[0] ?? null;

  const subjectOptions: SelectOption[] = [
    ...groups.map((g) => ({ value: g.key, label: g.name, trailing: `${g.count}件` })),
    ...(groups.length > 1
      ? [{ value: ALL_SUBJECTS, label: "全員", trailing: `${measurements.length}件` }]
      : []),
  ];

  const recordOptions: SelectOption[] = orderedForSubject.map((m) => {
    const total = compositeScore(m.indicators);
    return {
      value: m.uploadedAt,
      label: measurementLabel(m),
      detail: showAll ? `${m.subject ?? "測定者未設定"}・${m.sessionTag}` : m.sessionTag,
      trailing: String(total),
      trailingColor: scoreColor(total),
    };
  });

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Sync History</h1>
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
        {/* 育てた木 — ホームの Sync Tree バーと同じ値を読む（数字は同源） */}
        <div className="flex-1 bg-surface border border-surface-border rounded-3xl p-4 text-center neu-raised">
          <p className="text-2xl font-bold text-accent">{grownTrees}</p>
          <p className="text-xs text-text-muted mt-1">育てた木</p>
        </div>
      </div>

      <SimpleCalendar />

      {/* Sync Tree の記録（置き場）— 完成した木と完成日がここに溜まっていく。
          成長ロジックが入るまでは lib/sync-tree.ts の固定値を表示する。 */}
      <div className="bg-surface border-[1.5px] border-dashed border-surface-border rounded-3xl p-5 flex flex-col gap-2 neu-raised">
        <div className="flex items-center gap-2">
          <TreeDeciduous size={20} strokeWidth={1.5} className="text-accent" />
          <h2 className="text-base font-bold text-text-primary">Sync Tree の記録</h2>
          <span className="text-xs text-text-muted border border-surface-border rounded-full px-2 py-0.5">
            準備中
          </span>
        </div>
        <p className="text-xs text-text-muted">
          {completedTrees.length > 0
            ? completedTrees
                .map((t) => `${t.index}号木 ${formatTreeDate(t.completedAt)}`)
                .join("　・　")
            : "木が1本育つと、ここに完成日が記録されます"}
        </p>
      </div>
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
              className="h-12 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press"
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
            {/* Step 1 — whose records. Hidden while every record belongs to the
                same person: there is nothing to separate yet. */}
            {groups.length > 1 && (
              <SelectDropdown
                caption="測定者を選択"
                icon={<User size={18} strokeWidth={1.5} />}
                value={activeKey}
                options={subjectOptions}
                onChange={(v) => {
                  setSubjectKey(v);
                  setRecordId(null);
                }}
              />
            )}

            {/* Step 2 — which of that person's measurements. */}
            <SelectDropdown
              caption="測定データを選択"
              icon={<CalendarClock size={18} strokeWidth={1.5} />}
              value={selected?.uploadedAt ?? null}
              options={recordOptions}
              onChange={setRecordId}
              placeholder="測定記録がありません"
            />

            <BrainTrendChart measurements={forSubject} />

            {selected && (
              <MeasurementDetail
                m={selected}
                showSubject={groups.length > 1}
                onDelete={(t) => {
                  deleteMeasurement(t).catch((err) => console.error(err));
                  // The picker falls back to the next newest on its own.
                  setRecordId(null);
                }}
                onView={viewOnReport}
              />
            )}

            <EegUploader />
          </>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}
