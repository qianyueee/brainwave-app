"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePlaybackHistory } from "@/store/usePlaybackHistoryStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useSubjectStore, activeSubject } from "@/store/useSubjectStore";
import { useHistorySelectionStore } from "@/store/useHistorySelectionStore";
import { useRefreshAccountViewsOnMount } from "@/lib/sync/account-views";
import type { BrainProfile } from "@/lib/brain-profile";
import { compositeScore, scoreColor, measurementLabel } from "@/lib/brain-measurements";
import {
  ALL_SUBJECTS,
  NO_SUBJECT_NAME,
  matchesSubject,
  resolveSubjectKey,
  subjectDisplayName,
  subjectGroups,
} from "@/lib/subject-groups";
import { sessionTagLabel } from "@/lib/brain-measurements";
import { intlLocale, useLocale, useT, type Locale } from "@/lib/i18n";
import SimpleCalendar from "@/components/SimpleCalendar";
import BrainTrendChart from "@/components/BrainTrendChart";
import BrainRadarChart from "@/components/BrainRadarChart";
import Fullscreenable from "@/components/Fullscreenable";
import EegUploader from "@/components/EegUploader";
import SignalQualityBadge from "@/components/SignalQualityBadge";
import SelectDropdown, { type SelectOption } from "@/components/SelectDropdown";
import BaselineCheckList from "@/components/BaselineCheckList";
import { syncNoteFromMeasurement } from "@/lib/mind/note-sync";
import { formatTreeDate } from "@/lib/sync-tree";
import { useSyncTreeView } from "@/store/useSyncTreeStore";
import { Trash2, BrainCircuit, Lock, BarChart3, Pencil, StickyNote, User, CalendarClock, TreeDeciduous, ChevronRight } from "lucide-react";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";
import AccountSaveBanner from "@/components/AccountSaveBanner";

/** Max length of a measurement memo (matches the mind-map list). */
const NOTE_MAX = 200;

/**
 * 木の完成日（ローカルの YYYY-MM-DD）。日本語は従来どおり「7/2」、英語は
 * 月名で「Jul 2」——数字だけの月/日は英語圏でも読み順が割れる。
 */
function treeDateLabel(iso: string, locale: Locale): string {
  if (locale !== "en") return formatTreeDate(iso);
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(intlLocale(locale), {
    month: "short",
    day: "numeric",
  });
}

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
  const t = useT();
  const locale = useLocale();
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState("");
  const total = compositeScore(m.indicators);
  const date = new Date(m.uploadedAt);

  return (
    <div className="bg-surface border border-surface-border rounded-3xl neu-raised p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-text-primary">
            {date.toLocaleDateString(intlLocale(locale), {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          {showSubject && m.subject && (
            <p className="text-sm font-bold text-primary truncate">
              {subjectDisplayName(m.subject, locale)}
            </p>
          )}
          <p className="text-sm text-text-secondary truncate">{sessionTagLabel(m, locale)}</p>
          <SignalQualityBadge qualityPct={m.qualityPct} className="mt-1" />
        </div>
        <div className="text-right shrink-0">
          <p
            className="text-xl font-mono font-bold tabular-nums"
            style={{ color: scoreColor(total) }}
          >
            {total}
          </p>
          <p className="text-xs text-text-muted">{t("総合", "Overall")}</p>
        </div>
      </div>

      <Fullscreenable title={measurementLabel(m, locale)}>
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
            placeholder={t(
              "メモを入力…（体調・気分・状況など）",
              "Write a note… (how you feel, your mood, what was going on)"
            )}
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
                {t("キャンセル", "Cancel")}
              </button>
              <button
                onClick={() => {
                  syncNoteFromMeasurement(m.uploadedAt, draft);
                  setEditingNote(false);
                }}
                className="min-h-12 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold neu-raised-sm neu-press transition-transform"
              >
                {t("保存", "Save")}
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
          <Pencil size={14} /> {t("メモを追加", "Add a note")}
        </button>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => onView(m.uploadedAt)}
          className="flex items-center gap-2 min-h-12 px-4 py-2 rounded-2xl bg-primary text-on-primary text-sm font-bold neu-raised-sm neu-press transition-transform"
        >
          <BarChart3 size={16} /> {t("レポートで見る", "View in Report")}
        </button>
        <button
          onClick={() => {
            if (window.confirm(t("この記録を削除しますか？", "Delete this record?"))) {
              onDelete(m.uploadedAt);
            }
          }}
          className="flex items-center gap-2 min-h-12 px-4 py-2 rounded-2xl bg-navy text-danger text-sm font-medium neu-raised-sm neu-press transition-transform"
        >
          <Trash2 size={16} /> {t("削除", "Delete")}
        </button>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  // 再生の記録（端末に残り、ログイン中はアカウントとも揃う。useAppStore.sessionLogs は
  // この起動のあいだだけの流れで、Sync Tree の積算用）。
  const sessionLogs = usePlaybackHistory();
  const measurements = useBrainProfileStore((s) => s.measurements);
  const deleteMeasurement = useBrainProfileStore((s) => s.deleteMeasurement);
  const setViewingMeasurement = useBrainProfileStore((s) => s.setViewingMeasurement);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const subject = useSubjectStore(activeSubject);
  // Pick up records measured on another device (the desktop app) since the
  // last read — navigating here inside the app fires no focus event.
  useRefreshAccountViewsOnMount();

  // Guard hydration mismatch from persisted measurements
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // 測定者・記録の選択はページの外（ストア）に持つ——「レポートで見る」から
  // 戻ってきたとき、最新ではなく見ていた記録が開いたままであるように。
  const subjectKey = useHistorySelectionStore((s) => s.subjectKey);
  const setSubjectKey = useHistorySelectionStore((s) => s.setSubjectKey);
  const recordId = useHistorySelectionStore((s) => s.recordId);
  const setRecordId = useHistorySelectionStore((s) => s.setRecordId);
  const pinSelection = useHistorySelectionStore((s) => s.pin);

  // 再生の記録は端末に残る（persist 由来）ので、数えるのは mount 後。
  const totalSessions = hydrated ? sessionLogs.length : 0;
  const totalMinutes = hydrated
    ? Math.round(sessionLogs.reduce((sum, log) => sum + log.duration, 0) / 60)
    : 0;

  // Sync Tree（ログイン中だけ・アカウントにある）。統計タイルと記録カードは
  // ホームのカード・/tree と同じストアを読むので、数字が食い違わない。
  const tree = useSyncTreeView();
  const completedTrees = tree.view === "ready" ? tree.fold.completed : [];

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

  const viewOnReport = (uploadedAt: string) => {
    // 「最新」のまま（recordId が null）だと、戻るまでに新しい測定が入れば
    // そちらへ移ってしまう——いま開いている1件をはっきり選び直してから行く。
    pinSelection(activeKey, uploadedAt);
    setViewingMeasurement(uploadedAt);
    router.push("/report");
  };

  const recordCount = (n: number) => t(`${n}件`, n === 1 ? "1 record" : `${n} records`);
  const subjectOptions: SelectOption[] = [
    ...groups.map((g) => ({
      value: g.key,
      label: subjectDisplayName(g.name, locale),
      trailing: recordCount(g.count),
    })),
    ...(groups.length > 1
      ? [
          {
            value: ALL_SUBJECTS,
            label: t("全員", "Everyone"),
            trailing: recordCount(measurements.length),
          },
        ]
      : []),
  ];

  // 過去の測定（Sync Brain）と同じ扱い：メモがあれば見出しに立て、無ければ
  // 既定の日時ラベル。日時は detail の sessionTag が持っているので、見出しが
  // メモに入れ替わっても「いつの回か」は消えない。
  const recordOptions: SelectOption[] = orderedForSubject.map((m) => {
    const total = compositeScore(m.indicators);
    const note = m.note?.trim();
    const tag = sessionTagLabel(m, locale);
    const who = subjectDisplayName(m.subject ?? NO_SUBJECT_NAME, locale);
    return {
      value: m.uploadedAt,
      label: note || measurementLabel(m, locale),
      detail: showAll ? `${who}${t("・", " · ")}${tag}` : tag,
      trailing: String(total),
      trailingColor: scoreColor(total),
    };
  });

  return (
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      <PageHeader
        title="Sync History"
        subtitle={t("あなたのチューニング記録", "Your tuning records")}
      />

      <PageColumn>
      <AccountSaveBanner />

      {/* Mobile: single column. Desktop: stats+calendar | history side by side. */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
      <div className="flex flex-col gap-6">
      {/* Stats summary */}
      <div className="flex gap-3">
        <div className="flex-1 bg-surface border border-surface-border rounded-3xl p-4 text-center neu-raised">
          <p className="text-2xl font-bold text-primary">{totalSessions}</p>
          <p className="text-xs text-text-muted mt-1">{t("セッション", "Sessions")}</p>
        </div>
        <div className="flex-1 bg-surface border border-surface-border rounded-3xl p-4 text-center neu-raised">
          <p className="text-2xl font-bold text-accent">{totalMinutes}</p>
          <p className="text-xs text-text-muted mt-1">{t("合計（分）", "Total (min)")}</p>
        </div>
        {/* 育てた木 — /tree・ホームのカードと同じストアを読む（数字は同源）。
            未ログイン・読み込み中は数えようがないので「—」 */}
        <div className="flex-1 bg-surface border border-surface-border rounded-3xl p-4 text-center neu-raised">
          <p className="text-2xl font-bold text-accent">
            {tree.view === "ready" ? completedTrees.length : "—"}
          </p>
          <p className="text-xs text-text-muted mt-1">{t("育てた木", "Trees grown")}</p>
        </div>
      </div>

      <SimpleCalendar />

      {/* Sync Tree の記録 — 植え替えた木と完成日（202 に届いた日）が溜まっていく。 */}
      <Link
        href="/tree"
        className="bg-surface border border-surface-border rounded-3xl p-5 flex flex-col gap-2 neu-raised neu-press"
      >
        <div className="flex items-center gap-2">
          <TreeDeciduous size={20} strokeWidth={1.5} className="text-accent" />
          <h2 className="text-base font-bold text-text-primary">
            {t("Sync Tree の記録", "Sync Tree records")}
          </h2>
          <ChevronRight size={18} className="ml-auto text-text-muted" aria-hidden="true" />
        </div>
        <p className="text-sm text-text-secondary">
          {tree.view === "ready"
            ? completedTrees.length > 0
              ? completedTrees
                  .map((tr) =>
                    t(
                      `${tr.index}号木 ${formatTreeDate(tr.completedAt)}`,
                      `Tree ${tr.index} (${treeDateLabel(tr.completedAt, locale)})`
                    )
                  )
                  .join(t("　・　", " · "))
              : t(
                  "木が1本育つと、ここに完成日が記録されます",
                  "When a tree is fully grown, its completion date will be recorded here"
                )
            : tree.view === "logged-out"
              ? t(
                  "ログインすると、育てた木がここに記録されます",
                  "Log in and the trees you grow will be recorded here"
                )
              : tree.view === "error"
                ? t("木の記録を読み込めませんでした", "Couldn't load your tree records")
                : tree.view === "loading"
                  ? t("読み込み中…", "Loading…")
                  : "—"}
        </p>
      </Link>
      </div>

      <div className="flex flex-col gap-6">
      {/* Brainwave measurement history */}
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-bold text-text-primary">
            {t("脳波の記録", "Brainwave records")}
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            {t("測定ごとの6指標の推移", "Trend of the 6 indicators across your measurements")}
          </p>
        </div>

        {!hydrated ? null : !authLoading && !user ? (
          <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-navy flex items-center justify-center neu-inset">
              <Lock size={28} className="text-text-muted" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-text-secondary">
              {t(
                "ログインすると脳波データを記録・同期できます",
                "Log in to record and sync your brainwave data"
              )}
            </p>
            <button
              onClick={() => openAuthModal("login")}
              className="h-12 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press"
            >
              {t("ログイン", "Log in")}
            </button>
          </div>
        ) : measurements.length === 0 ? (
          <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised">
            <div className="flex justify-center mb-4">
              <BrainCircuit size={40} className="text-primary" strokeWidth={1.5} />
            </div>
            <p className="text-base font-bold text-text-primary mb-2">
              {t("まだ記録がありません", "No records yet")}
            </p>
            <p className="text-sm text-text-secondary mb-6">
              {t(
                "シンク・ブレインや PC の測定アプリ（ログインして測定）で測るか、脳波データをアップロードすると、ここに測定の履歴と推移が表示されます。",
                "Measure on Sync Brain or with the PC measurement app (log in before measuring), or upload brainwave data, and your measurement history and trend will appear here."
              )}
            </p>
            <EegUploader />
          </div>
        ) : (
          <>
            {/* Step 1 — whose records. Hidden while every record belongs to the
                same person: there is nothing to separate yet. */}
            {groups.length > 1 && (
              <SelectDropdown
                caption={t("測定者を選択", "Choose a person")}
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
              caption={t("測定データを選択", "Choose a measurement")}
              icon={<CalendarClock size={18} strokeWidth={1.5} />}
              value={selected?.uploadedAt ?? null}
              options={recordOptions}
              onChange={setRecordId}
              placeholder={t("測定記録がありません", "No measurement records")}
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

      {/* 10秒チェックの記録 — 脳波の記録と並べて置く（同じ「測った結果を
          見返す」場所）。ただし認証ゲートの外：このストアは素の localStorage
          なので未ログインでも記録が貯まる。 */}
      <BaselineCheckList />
      </div>
      </div>
      </PageColumn>
    </div>
  );
}
