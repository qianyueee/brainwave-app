"use client";

import { useState, useSyncExternalStore } from "react";
import { Trash2, Pencil, StickyNote, BarChart3, User, CalendarClock } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { useImportSession, sessionLabel, type ImportStatus } from "./useImportSession";
import { syncNoteFromSession } from "@/lib/mind/note-sync";
import { formatTime } from "@/lib/utils";
import { signalQualityPct } from "@/lib/brain-profile";
import SignalQualityBadge from "@/components/SignalQualityBadge";
import SelectDropdown, { type SelectOption } from "@/components/SelectDropdown";
import { useSubjectStore, activeSubject } from "@/store/useSubjectStore";
import {
  ALL_SUBJECTS,
  matchesSubject,
  resolveSubjectKey,
  subjectGroups,
} from "@/lib/subject-groups";

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
 * 過去の測定 — a two-step picker rather than a scrolling list: choose 測定者
 * first, then one of that person's recordings, and only the chosen measurement
 * is shown in full. One headset is often shared, so answering "whose?" before
 * "which?" is what keeps a long shared history readable.
 *
 * The selected measurement can be opened in the 脳特性 chart (via the shared
 * useImportSession flow) and carries an editable free-text memo.
 */
export default function SessionList() {
  const sessions = useMindStore((s) => s.sessions);
  const deleteSession = useMindStore((s) => s.deleteSession);
  const { importSession, statusFor } = useImportSession();
  const subject = useSubjectStore(activeSubject);

  // false during SSR/hydration, true after — persisted sessions only render
  // client-side, avoiding a hydration mismatch.
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );

  const [subjectKey, setSubjectKey] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // Who appears in the history, most recently measured first. Derived from the
  // recordings themselves, so a deleted subject's past measurements are still
  // reachable and a subject with no recordings does not clutter the picker.
  const groups = hydrated
    ? subjectGroups(sessions, (s) => ({ key: s.subjectId, name: s.subjectName }))
    : [];

  // Defaults to whoever is being measured now; a stale pick (subject deleted,
  // last recording removed) falls back instead of showing an empty list.
  const activeKey = resolveSubjectKey(subjectKey, groups, subject?.id);
  const showAll = activeKey === ALL_SUBJECTS;

  const forSubject = activeKey
    ? sessions.filter((s) => matchesSubject({ key: s.subjectId }, activeKey))
    : [];

  // Same fallback for the record: after a delete or a subject switch the id no
  // longer matches, so the newest recording of the selected person is shown.
  const selected = forSubject.find((s) => s.id === sessionId) ?? forSubject[0] ?? null;

  const subjectOptions: SelectOption[] = [
    ...groups.map((g) => ({
      value: g.key,
      label: g.name,
      trailing: `${g.count}件`,
    })),
    // Only meaningful once a second person has been measured.
    ...(groups.length > 1
      ? [{ value: ALL_SUBJECTS, label: "全員", trailing: `${sessions.length}件` }]
      : []),
  ];

  // メモがあればそれを見出しに、無ければ既定の日時ラベル。日時だけの一覧では
  // 「どれがどの回か」が思い出せないので、本人の言葉が入っているならそちらを
  // 先に見せる。日時は detail 側へ回して、見出しが入れ替わっても失われない。
  const sessionOptions: SelectOption[] = forSubject.map((s) => {
    const note = s.note?.trim();
    const meta = showAll
      ? `${s.subjectName ?? "測定者未設定"}・${formatTime(s.durationSec)}`
      : `${formatTime(s.durationSec)}・ゾーン率 ${s.flowRatioPct}%`;
    return {
      value: s.id,
      label: `${note || sessionLabel(s)}${s.source === "demo" ? "（デモ）" : ""}`,
      detail: note ? `${sessionLabel(s)}・${meta}` : meta,
    };
  });

  const status = selected ? statusFor(selected.id) : "idle";

  const startEdit = (note: string) => {
    setDraft(note);
    setEditing(true);
  };
  const saveEdit = () => {
    if (selected) syncNoteFromSession({ id: selected.id, startedAt: selected.startedAt }, draft);
    setEditing(false);
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-text-primary">過去の測定</h2>

      {!hydrated || sessions.length === 0 ? (
        <p className="text-base text-text-secondary">まだ測定記録がありません</p>
      ) : (
        <>
          {/* Step 1 — whose records. Hidden while only one person has been
              measured: there is nothing to separate yet. Independent of the
              測定者 selector above, which picks who the *next* recording is for. */}
          {groups.length > 1 && (
            <SelectDropdown
              caption="測定者を選択"
              icon={<User size={18} strokeWidth={1.5} />}
              value={activeKey}
              options={subjectOptions}
              onChange={(v) => {
                setSubjectKey(v);
                setSessionId(null);
                setEditing(false);
              }}
            />
          )}

          {/* Step 2 — which of that person's recordings. */}
          <SelectDropdown
            caption="測定データを選択"
            icon={<CalendarClock size={18} strokeWidth={1.5} />}
            value={selected?.id ?? null}
            options={sessionOptions}
            onChange={(v) => {
              setSessionId(v);
              setEditing(false);
            }}
            placeholder="測定記録がありません"
          />

          {selected && (
            <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col gap-3">
              <div>
                <p className="text-base font-bold text-text-primary">
                  {sessionLabel(selected)}
                  {selected.source === "demo" && (
                    <span className="ml-2 text-xs font-normal text-text-muted">デモ</span>
                  )}
                </p>
                {/* Whose record this is — shown when the list mixes people. */}
                {(showAll || groups.length > 1) && (
                  <p className="text-sm font-bold text-primary truncate">
                    {selected.subjectName ?? "測定者未設定"}
                  </p>
                )}
                <p className="text-sm text-text-secondary">
                  {formatTime(selected.durationSec)}・集中 {selected.avgAttention}・リラックス{" "}
                  {selected.avgMeditation}・ゾーン率 {selected.flowRatioPct}%
                </p>
                <SignalQualityBadge
                  qualityPct={signalQualityPct(selected.usableSec, selected.durationSec)}
                  className="mt-1"
                />
              </div>

              {/* Memo: edit inline, kept in sync with the imported measurement. */}
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
                        onClick={() => setEditing(false)}
                        className="min-h-12 px-4 py-2 rounded-xl bg-navy text-text-secondary text-sm font-medium neu-raised-sm neu-press transition-transform"
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={saveEdit}
                        className="min-h-12 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold neu-raised-sm neu-press transition-transform"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              ) : selected.note ? (
                <button
                  onClick={() => startEdit(selected.note ?? "")}
                  className="w-full text-left flex items-start gap-2 rounded-xl bg-navy neu-inset p-3 active:opacity-70"
                >
                  <StickyNote size={16} className="shrink-0 mt-0.5 text-text-muted" />
                  <span className="flex-1 text-sm text-text-secondary whitespace-pre-wrap break-words">
                    {selected.note}
                  </span>
                  <Pencil size={14} className="shrink-0 mt-0.5 text-text-muted" />
                </button>
              ) : (
                <button
                  onClick={() => startEdit("")}
                  className="self-start flex items-center gap-1.5 text-sm text-text-muted active:opacity-70"
                >
                  <Pencil size={14} /> メモを追加
                </button>
              )}

              {STATUS_TEXT[status] && (
                <p
                  className={`text-xs ${
                    status === "error"
                      ? "text-danger"
                      : status === "busy"
                        ? "text-primary"
                        : "text-text-muted"
                  }`}
                >
                  {STATUS_TEXT[status]}
                </p>
              )}

              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => importSession(selected)}
                  disabled={status === "busy"}
                  className="flex items-center gap-2 min-h-12 px-4 py-2 rounded-2xl bg-primary text-on-primary text-sm font-bold neu-raised-sm neu-press transition-transform disabled:opacity-60"
                >
                  <BarChart3 size={16} /> レポートで見る
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("この測定記録を削除しますか？")) {
                      deleteSession(selected.id);
                      // The picker falls back to the next newest on its own.
                      setSessionId(null);
                      setEditing(false);
                    }
                  }}
                  className="flex items-center gap-2 min-h-12 px-4 py-2 rounded-2xl bg-navy text-danger text-sm font-medium neu-raised-sm neu-press transition-transform"
                >
                  <Trash2 size={16} /> 削除
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
