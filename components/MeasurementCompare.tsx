"use client";

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
import { useLocale, useT } from "@/lib/i18n";
import SelectDropdown, { type SelectOption } from "@/components/SelectDropdown";
import BrainRadarCompare from "@/components/BrainRadarCompare";
import BrainBandCompare from "@/components/BrainBandCompare";
import Fullscreenable from "@/components/Fullscreenable";
import { CalendarClock, GitCompare, User } from "lucide-react";

/** 「比べない」の選択肢の値（記録の id＝ISO の日時とは重ならない）。 */
const NO_PICK = "__no_pick__";

/**
 * Sync Report「測定の比較」の中身。以前は Sync History の「脳波の記録」にあった
 * 測定者 → 測定データの下拉を、比較の選び方として使う（チェックボックスの一覧の
 * 代わり）：
 *
 *   測定者を選択（2人以上のときだけ。2人以上なら「全員」も）
 *   → 測定データを選択（その人の1件。既定は最新）
 *   → 比較する測定データ（任意）→ 3件目（任意）
 *
 * 1件なら6指標と脳波バランス、2〜3件なら同じ2枚に並べて比較。推移グラフと
 * 1件ずつのカード（6指標・メモ・レポートへ・削除）は Sync History に残してある
 * ——ヒストリーではカレンダーで記録を選ぶ。
 *
 * 選択は useCompareSelectionStore（ページの外）に持つ。
 */
export default function MeasurementCompare() {
  const t = useT();
  const locale = useLocale();
  const measurements = useBrainProfileStore((s) => s.measurements);
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

  // Newest first for the dropdowns.
  const orderedForSubject = activeKey
    ? ordered.filter((m) => matchesSubject({ key: m.subject }, activeKey))
    : [];

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

  return (
    // Mobile: pickers, then the comparison below. Desktop: pickers | comparison.
    <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
      <div className="flex flex-col gap-3">
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

      <div className="flex flex-col gap-6">
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

      </div>
    </div>
  );
}
