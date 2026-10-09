"use client";

import { useState } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useSubjectStore, activeSubject } from "@/store/useSubjectStore";
import { useCompareSelectionStore } from "@/store/useCompareSelectionStore";
import type { BrainProfile } from "@/lib/brain-profile";
import {
  compositeScore,
  scoreColor,
  measurementLabel,
  measurementTitle,
  measurementSeriesLabel,
  sessionTagLabel,
} from "@/lib/brain-measurements";
import {
  ALL_SUBJECTS,
  NO_SUBJECT_NAME,
  matchesSubject,
  resolveSubjectKey,
  subjectDisplayName,
  subjectGroups,
} from "@/lib/subject-groups";
import { syncNoteFromMeasurement } from "@/lib/mind/note-sync";
import { intlLocale, useLocale, useT } from "@/lib/i18n";
import SelectDropdown, { type SelectOption } from "@/components/SelectDropdown";
import BrainRadarCompare from "@/components/BrainRadarCompare";
import BrainBandCompare from "@/components/BrainBandCompare";
import BrainTrendChart from "@/components/BrainTrendChart";
import Fullscreenable from "@/components/Fullscreenable";
import EegUploader from "@/components/EegUploader";
import SignalQualityBadge from "@/components/SignalQualityBadge";
import { BarChart3, CalendarClock, GitCompare, Pencil, StickyNote, Trash2, User } from "lucide-react";

/** Max length of a measurement memo (matches the mind-map list). */
const NOTE_MAX = 200;

/** 「比べない」の選択肢の値（記録の id＝ISO の日時とは重ならない）。 */
const NO_PICK = "__no_pick__";

/**
 * 「測定データを選択」で選んだ1件の記録：いつ・誰の・総合点・メモ・レポートへ・削除。
 * 6指標のレーダーは上の比較のカードが描くので、ここには置かない（同じ図を2枚
 * 並べない）。
 */
function MeasurementRecordCard({
  m,
  showSubject,
  onDelete,
  onView,
}: {
  m: BrainProfile;
  /** Whose record this is — worth showing once the records mix people. */
  showSubject: boolean;
  onDelete: (uploadedAt: string) => void;
  /** Open this measurement on the 脳特性チャート tab. */
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
          className="self-start flex items-center gap-1.5 min-h-12 text-sm text-text-muted active:opacity-70"
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

/**
 * Sync Report「測定の比較」の中身。以前は Sync History の「脳波の記録」にあった
 * 測定者 → 測定データの2段の選択を、比較の選び方としてそのまま使う：
 *
 *   測定者を選択（2人以上のときだけ。2人以上なら「全員」も）
 *   → 測定データを選択（その人の1件。既定は最新）
 *   → 比較する測定データ（任意）→ 3件目（任意）
 *
 * 1件なら6指標と脳波バランス、2〜3件なら同じ2枚に並べて比較。その下に推移
 * （選んだ測定者の記録だけ——人が混ざった線は推移にならない）と、選んだ1件の
 * メモ・レポートへ・削除。
 *
 * 選択は useCompareSelectionStore（ページの外）に持つ。
 */
export default function MeasurementCompare({
  onViewReport,
}: {
  /** この1件を「脳特性チャート」タブで開く（同じページのタブ切り替え）。 */
  onViewReport: (uploadedAt: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const measurements = useBrainProfileStore((s) => s.measurements);
  const deleteMeasurement = useBrainProfileStore((s) => s.deleteMeasurement);
  const subject = useSubjectStore(activeSubject);
  const subjectKey = useCompareSelectionStore((s) => s.subjectKey);
  const setSubjectKey = useCompareSelectionStore((s) => s.setSubjectKey);
  const ids = useCompareSelectionStore((s) => s.ids);
  const setIds = useCompareSelectionStore((s) => s.setIds);

  // Newest first for the pickers (`measurements` is oldest→newest).
  const ordered = [...measurements].reverse();

  // ── 測定者 → 測定データ ──
  // Grouped by the name stored on each record (a measurement keeps the name, not
  // an id, so it stays readable after a rename), most recently measured first.
  const groups = subjectGroups(ordered, (m) => ({ key: m.subject, name: m.subject }));
  // Defaults to whoever is being measured on Sync Brain, else the latest record.
  const activeKey = resolveSubjectKey(subjectKey, groups, subject?.name);
  const showAll = activeKey === ALL_SUBJECTS;

  // Oldest→newest for the trend chart, newest-first for the dropdowns.
  const forSubject = activeKey
    ? measurements.filter((m) => matchesSubject({ key: m.subject }, activeKey))
    : [];
  const orderedForSubject = [...forSubject].reverse();

  // 選んだ測定（[0]＝主の1件）。消えた記録・別の測定者の記録は外し、何も残らなければ
  // その測定者の最新。
  const byId = new Map(orderedForSubject.map((m) => [m.uploadedAt, m]));
  const picks: BrainProfile[] = [];
  for (const id of ids) {
    const m = byId.get(id);
    if (m && !picks.includes(m)) picks.push(m);
  }
  if (picks.length === 0 && orderedForSubject[0]) picks.push(orderedForSubject[0]);
  const pickedIds = picks.map((m) => m.uploadedAt);
  const primary = picks[0] ?? null;

  /** index 番目を選び直す（null＝外す。後ろの測定は1つ前へ詰める）。 */
  const setPick = (index: number, id: string | null) => {
    if (id === null) {
      setIds(pickedIds.filter((_, i) => i !== index));
      return;
    }
    const next = [...pickedIds];
    next[index] = id;
    // 同じ測定が2か所に入らないように——主の1件に比べる側の測定を選んだら、
    // 比べる側からは外す。
    setIds(next.filter((x, i) => x !== id || i === index));
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

  // メモがあれば見出しに立て、無ければ既定の日時ラベル。日時は detail の
  // sessionTag が持っているので、見出しがメモに入れ替わっても「いつの回か」は消えない。
  const recordOption = (m: BrainProfile): SelectOption => {
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
  };
  const primaryOptions = orderedForSubject.map(recordOption);
  // 比べる側の選択肢：先頭に「比べない」、ほかの欄で選んでいる測定は出さない。
  const compareOptions = (index: number, noneLabel: string): SelectOption[] => [
    { value: NO_PICK, label: noneLabel },
    ...orderedForSubject
      .filter((m) => !pickedIds.some((id, i) => i !== index && id === m.uploadedAt))
      .map(recordOption),
  ];

  // The picked measurements, ordered oldest→newest for the charts.
  const series = [...picks].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  const canCompare = series.length >= 2;
  // 脳波バランスは bands のある記録だけ（以前の記録には無い）。6指標はどの記録にもある。
  const withBands = series.filter((m) => m.bands);

  const viewReport = (uploadedAt: string) => {
    // 「最新」のまま（ids が空）だと、戻るまでに新しい測定が入ればそちらへ
    // 移ってしまう——いま開いている選択をはっきり決めてから行く。
    setIds(pickedIds);
    onViewReport(uploadedAt);
  };

  return (
    // Mobile: pickers → comparison → trend → the record. Desktop: pickers and the
    // record on the left, comparison and trend spanning the right — the record
    // sits right under the pickers instead of below the (taller) charts.
    <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:grid-rows-[auto_1fr] md:gap-6">
      <div className="flex flex-col gap-3 md:col-start-1 md:row-start-1">
        {/* Step 1 — whose records. Hidden while every record belongs to the
            same person: there is nothing to separate yet. */}
        {groups.length > 1 && (
          <SelectDropdown
            caption={t("測定者を選択", "Choose a person")}
            icon={<User size={18} strokeWidth={1.5} />}
            value={activeKey}
            options={subjectOptions}
            onChange={setSubjectKey}
          />
        )}

        {/* Step 2 — which of that person's measurements. */}
        <SelectDropdown
          caption={t("測定データを選択", "Choose a measurement")}
          icon={<CalendarClock size={18} strokeWidth={1.5} />}
          value={primary?.uploadedAt ?? null}
          options={primaryOptions}
          onChange={(v) => setPick(0, v)}
          placeholder={t("測定記録がありません", "No measurement records")}
        />

        {/* Step 3 — what to set beside it (optional, up to two more). */}
        {orderedForSubject.length >= 2 && (
          <SelectDropdown
            caption={t("比較する測定データ（任意）", "Compare with (optional)")}
            icon={<GitCompare size={18} strokeWidth={1.5} />}
            value={pickedIds[1] ?? NO_PICK}
            options={compareOptions(1, t("比較しない", "Don't compare"))}
            onChange={(v) => setPick(1, v === NO_PICK ? null : v)}
          />
        )}
        {picks.length >= 2 && orderedForSubject.length >= 3 && (
          <SelectDropdown
            caption={t("3件目の測定データ（任意）", "A third measurement (optional)")}
            icon={<GitCompare size={18} strokeWidth={1.5} />}
            value={pickedIds[2] ?? NO_PICK}
            options={compareOptions(2, t("選ばない", "None"))}
            onChange={(v) => setPick(2, v === NO_PICK ? null : v)}
          />
        )}
      </div>

      <div className="flex flex-col gap-6 md:col-start-2 md:row-start-1 md:row-span-2">
        {series.length > 0 && (
          <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col gap-4">
            <div className="min-w-0">
              <p className="text-base font-bold text-text-primary truncate">
                {canCompare
                  ? t("測定の比較", "Compare measurements")
                  : measurementTitle(series[0], locale)}
              </p>
              {!canCompare && (
                <p className="text-xs text-text-muted">
                  {orderedForSubject.length >= 2
                    ? t(
                        "「比較する測定データ」を選ぶと並べて比較できます",
                        "Choose “Compare with” to see them side by side"
                      )
                    : t(
                        "もう1件測定すると並べて比較できます",
                        "Take one more measurement to compare side by side"
                      )}
                </p>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-text-secondary mb-1 text-center">
                {t("6指標", "6 indicators")}
              </p>
              <Fullscreenable
                title={
                  canCompare
                    ? t("6指標の比較", "Comparing the 6 indicators")
                    : t("6指標", "6 indicators")
                }
              >
                <BrainRadarCompare
                  series={series.map((m) => ({
                    indicators: m.indicators,
                    label: measurementSeriesLabel(m, locale),
                  }))}
                />
              </Fullscreenable>
            </div>

            {/* 8種類の脳波それぞれの割合を、測定ごとの棒で並べる（横＝波の種類、
                縦＝%）。値はレポートの円グラフと同じ bands なので、1件のレポートと
                数字が食い違わない。 */}
            <div>
              <p className="text-sm font-medium text-text-secondary mb-1 text-center">
                {t("8種類の脳波バランス", "Brainwave balance (8 types)")}
              </p>
              {withBands.length > 0 ? (
                <>
                  <Fullscreenable
                    title={
                      withBands.length >= 2
                        ? t("脳波バランスの比較", "Comparing brainwave balance")
                        : t("8種類の脳波バランス", "Brainwave balance (8 types)")
                    }
                  >
                    <BrainBandCompare
                      series={withBands.map((m) => ({
                        bands: m.bands!,
                        label: measurementSeriesLabel(m, locale),
                      }))}
                    />
                  </Fullscreenable>
                  {withBands.length < series.length && (
                    <p className="text-xs text-text-muted text-center mt-1">
                      {t(
                        "脳波バランスのデータが無い測定は除いています",
                        "Measurements without brainwave balance data are left out"
                      )}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-text-secondary text-center py-6">
                  {t(
                    "選んだ測定には脳波バランスのデータが含まれていません。",
                    "The chosen measurement has no brainwave balance data."
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        <BrainTrendChart measurements={forSubject} />
      </div>

      <div className="flex flex-col gap-6 md:col-start-1 md:row-start-2 md:self-start">
        {primary && (
          <MeasurementRecordCard
            // A memo half-written for one record must not carry over to the next.
            key={primary.uploadedAt}
            m={primary}
            showSubject={groups.length > 1}
            onDelete={(uploadedAt) => {
              deleteMeasurement(uploadedAt).catch((err) => console.error(err));
              // The picker falls back to the next one on its own.
              setIds(pickedIds.filter((id) => id !== uploadedAt));
            }}
            onView={viewReport}
          />
        )}

        <EegUploader />
      </div>
    </div>
  );
}
