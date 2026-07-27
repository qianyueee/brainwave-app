"use client";

import { useState, useSyncExternalStore } from "react";
import { Trash2, ChevronRight, Pencil, StickyNote } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { useImportSession, sessionLabel, type ImportStatus } from "./useImportSession";
import { syncNoteFromSession } from "@/lib/mind/note-sync";
import { formatTime } from "@/lib/utils";
import { signalQualityPct } from "@/lib/brain-profile";
import SignalQualityBadge from "@/components/SignalQualityBadge";
import { useSubjectStore, activeSubject } from "@/store/useSubjectStore";

/** Default number of rows shown before the 全て toggle is pressed. */
const DEFAULT_COUNT = 4;
/** Max length of a measurement memo. */
const NOTE_MAX = 200;

const subscribeNoop = () => () => {};

const STATUS_TEXT: Partial<Record<ImportStatus, string>> = {
  busy: "脳特性に取り込み中…",
  waitingLogin: "ログインすると脳特性で確認できます",
  waitingCloud: "データの同期を待っています…",
  error: "取り込みに失敗しました。もう一度お試しください",
};

/**
 * 過去の測定 list. Defaults to the latest DEFAULT_COUNT rows with a 全て toggle.
 * Tapping a row opens that measurement in the 脳特性 chart via the shared
 * useImportSession flow. Each row also carries an editable free-text memo,
 * kept separate from the import tap so editing never navigates away.
 */
export default function SessionList() {
  const sessions = useMindStore((s) => s.sessions);
  const deleteSession = useMindStore((s) => s.deleteSession);
  const { importSession, statusFor } = useImportSession();
  const subjectCount = useSubjectStore((s) => s.subjects.length);
  const subject = useSubjectStore(activeSubject);
  const [allSubjects, setAllSubjects] = useState(false);

  // false during SSR/hydration, true after — persisted sessions only render
  // client-side, avoiding a hydration mismatch.
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (id: string, note: string | undefined) => {
    setEditingId(id);
    setDraft(note ?? "");
  };
  const saveEdit = (id: string) => {
    const s = sessions.find((x) => x.id === id);
    // Save on the session and mirror to its imported 脳特性 measurement.
    if (s) syncNoteFromSession({ id: s.id, startedAt: s.startedAt }, draft);
    setEditingId(null);
  };

  // With a single subject there is nothing to separate, so the filter stays out
  // of the way — and recordings made before subjects existed keep showing up.
  // It appears only once a second person has actually been measured.
  const filtering = subjectCount > 1 && !allSubjects && !!subject;
  const forSubject = filtering
    ? sessions.filter((s) => s.subjectId === subject.id)
    : sessions;
  const hiddenCount = sessions.length - forSubject.length;

  const visible = hydrated
    ? showAll
      ? forSubject
      : forSubject.slice(0, DEFAULT_COUNT)
    : [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-lg font-bold text-text-primary">
          過去の測定
          {filtering && (
            <span className="ml-2 text-sm font-normal text-text-secondary">
              {subject.name}
            </span>
          )}
        </h2>
        {hydrated && forSubject.length > DEFAULT_COUNT && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="shrink-0 px-3 py-1.5 rounded-xl border border-surface-border text-sm font-medium text-primary neu-raised-sm neu-press transition-transform"
          >
            {showAll ? "閉じる" : "全て"}
          </button>
        )}
      </div>

      {hydrated && subjectCount > 1 && (hiddenCount > 0 || allSubjects) && (
        <button
          onClick={() => setAllSubjects((v) => !v)}
          className="self-start text-sm text-primary underline underline-offset-4 active:opacity-70"
        >
          {allSubjects
            ? `${subject?.name ?? "測定者"}のみ表示`
            : `他の測定者の記録も表示（${hiddenCount}件）`}
        </button>
      )}

      {!hydrated || forSubject.length === 0 ? (
        <p className="text-base text-text-secondary">まだ測定記録がありません</p>
      ) : (
        visible.map((s) => {
          const status = statusFor(s.id);
          const editing = editingId === s.id;
          return (
            <div
              key={s.id}
              className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => importSession(s)}
                  disabled={status === "busy"}
                  className="min-w-0 flex-1 text-left flex items-center gap-2 active:opacity-70"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-text-primary">
                      {sessionLabel(s)}
                      {s.source === "demo" && (
                        <span className="ml-2 text-xs font-normal text-text-muted">デモ</span>
                      )}
                    </p>
                    {/* Only when the list mixes people — otherwise it is noise. */}
                    {!filtering && subjectCount > 1 && (
                      <p className="text-xs font-bold text-primary">
                        {s.subjectName ?? "測定者未設定"}
                      </p>
                    )}
                    <p className="text-sm text-text-secondary">
                      {formatTime(s.durationSec)}・集中 {s.avgAttention}・リラックス{" "}
                      {s.avgMeditation}・ゾーン率 {s.flowRatioPct}%
                    </p>
                    <SignalQualityBadge
                      qualityPct={signalQualityPct(s.usableSec, s.durationSec)}
                      className="mt-1"
                    />
                    {STATUS_TEXT[status] && (
                      <p
                        className={`text-xs mt-1 ${
                          status === "error"
                            ? "text-red-400"
                            : status === "busy"
                              ? "text-primary"
                              : "text-text-muted"
                        }`}
                      >
                        {STATUS_TEXT[status]}
                      </p>
                    )}
                  </div>
                  {s.indicators && (
                    <ChevronRight size={20} className="shrink-0 text-text-muted" />
                  )}
                </button>
                <button
                  onClick={() => deleteSession(s.id)}
                  aria-label="削除"
                  className="shrink-0 w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-muted"
                >
                  <Trash2 size={20} />
                </button>
              </div>

              {/* Memo: edit inline, kept out of the import tap target. */}
              {editing ? (
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
                        onClick={() => setEditingId(null)}
                        className="px-4 py-2 rounded-xl bg-navy text-text-secondary text-sm font-medium neu-raised-sm neu-press transition-transform"
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={() => saveEdit(s.id)}
                        className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold neu-raised-sm neu-press transition-transform"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              ) : s.note ? (
                <button
                  onClick={() => startEdit(s.id, s.note)}
                  className="w-full text-left flex items-start gap-2 rounded-xl bg-navy neu-inset p-3 active:opacity-70"
                >
                  <StickyNote size={16} className="shrink-0 mt-0.5 text-text-muted" />
                  <span className="flex-1 text-sm text-text-secondary whitespace-pre-wrap break-words">
                    {s.note}
                  </span>
                  <Pencil size={14} className="shrink-0 mt-0.5 text-text-muted" />
                </button>
              ) : (
                <button
                  onClick={() => startEdit(s.id, "")}
                  className="self-start flex items-center gap-1.5 text-sm text-text-muted active:opacity-70"
                >
                  <Pencil size={14} /> メモを追加
                </button>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
