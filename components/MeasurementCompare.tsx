"use client";

import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useSubjectStore, activeSubject } from "@/store/useSubjectStore";
import { useCompareSelectionStore } from "@/store/useCompareSelectionStore";
import type { BrainProfile } from "@/lib/brain-profile";
import {
  compositeScore,
  scoreColor,
  isGeneratedSessionTag,
  measurementLabel,
  measurementTitle,
  measurementSeriesLabel,
  sessionTagLabel,
} from "@/lib/brain-measurements";
import { COMPARISON_MAX } from "@/lib/brain-analysis";
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
import MultiSelectList from "@/components/MultiSelectList";
import BrainRadarCompare from "@/components/BrainRadarCompare";
import BrainBandCompare from "@/components/BrainBandCompare";
import BrainAiCompare from "@/components/BrainAiCompare";
import Fullscreenable from "@/components/Fullscreenable";
import { User } from "lucide-react";

/**
 * Sync Report「測定の比較」の中身：
 *
 *   測定者を選択（下拉。2人以上のときだけ。2人以上なら「全員」も）
 *   → その人の測定の一覧から、比べたい測定を 1〜3件チェックする（既定は最新1件）
 *
 * 1件なら6指標と脳波バランス、2〜3件なら同じ2枚に並べて比較し、その下に
 * 「AIによる比較分析」（BrainAiCompare）。推移グラフと1件ずつのカード（6指標・
 * メモ・レポートへ・削除）は Sync History に残してある——ヒストリーではカレンダーで
 * 記録を選ぶ。
 *
 * 以前は「測定データを選択」→「比較する測定データ」→「3件目」と下拉を3つ
 * 開き直して選んでいた。比べる測定を足すたびに別の一覧を開くのは手間なので、
 * 1つの一覧で何件でも（3件まで）チェックする形にした（MultiSelectList）。
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

  // ── 測定者 → 測定の一覧 ──
  // Grouped by the name stored on each record (a measurement keeps the name, not
  // an id, so it stays readable after a rename), most recently measured first.
  const groups = subjectGroups(ordered, (m) => ({ key: m.subject, name: m.subject }));
  // Defaults to whoever is being measured on Sync Brain, else the latest record.
  const activeKey = resolveSubjectKey(subjectKey, groups, subject?.name);
  const showAll = activeKey === ALL_SUBJECTS;

  // Newest first for the list.
  const orderedForSubject = activeKey
    ? ordered.filter((m) => matchesSubject({ key: m.subject }, activeKey))
    : [];

  // チェックした測定。消えた記録・別の測定者の記録は外す。まだ何も触っていない
  // （null）か、選んでいた記録がどれも消えたときはその測定者の最新1件——開いた
  // ときに何も出ない画面にしない。本人が全部外したとき（[]）だけは何も選ばない。
  const byId = new Map(orderedForSubject.map((m) => [m.uploadedAt, m]));
  const picks: BrainProfile[] = [];
  for (const id of ids ?? []) {
    const m = byId.get(id);
    if (m && !picks.includes(m)) picks.push(m);
  }
  if (picks.length === 0 && ids?.length !== 0 && orderedForSubject[0]) {
    picks.push(orderedForSubject[0]);
  }
  const pickedIds = picks.map((m) => m.uploadedAt);

  /** 一覧の1行をタップ：選んでいなければ足し（3件まで）、選んでいれば外す。 */
  const togglePick = (id: string) => {
    if (pickedIds.includes(id)) setIds(pickedIds.filter((x) => x !== id));
    else if (pickedIds.length < COMPARISON_MAX) setIds([...pickedIds, id]);
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

  // 1行目：メモがあればメモ、無ければ日時。2行目：見出しに出ていないことだけ——
  // 「全員」のときの測定者、見出しがメモのときの日時、アップロードしたファイルの
  // Tag 列・ファイル名。取り込んだ測定の sessionTag は日時そのものなので、メモの
  // 無い回に2行目へ同じ日時を繰り返さない。
  const recordOption = (m: BrainProfile): SelectOption => {
    const total = compositeScore(m.indicators);
    const note = m.note?.trim();
    const detail = [
      showAll ? subjectDisplayName(m.subject ?? NO_SUBJECT_NAME, locale) : null,
      note ? measurementLabel(m, locale) : null,
      m.sessionTag && !isGeneratedSessionTag(m) ? sessionTagLabel(m, locale) : null,
    ]
      .filter(Boolean)
      .join(t("・", " · "));
    return {
      value: m.uploadedAt,
      label: note || measurementLabel(m, locale),
      detail: detail || undefined,
      trailing: String(total),
      trailingColor: scoreColor(total),
    };
  };
  const recordOptions = orderedForSubject.map(recordOption);

  // The picked measurements, ordered oldest→newest for the charts.
  const series = [...picks].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  const canCompare = series.length >= 2;
  // 脳波バランスは bands のある記録だけ（以前の記録には無い）。6指標はどの記録にもある。
  const withBands = series.filter((m) => m.bands);

  // 一覧の下の1行。上限に来て選んでいない行が押せなくなったときだけ、なぜかを言う
  // （1件のときの「もう1件選ぶと〜」は比較のカードの見出しの下に出る）。
  const listHint =
    picks.length >= COMPARISON_MAX && orderedForSubject.length > COMPARISON_MAX
      ? t(
          `${COMPARISON_MAX}件まで選べます。別の測定を選ぶときは、どれかのチェックを外してください。`,
          `You can choose up to ${COMPARISON_MAX}. To choose a different one, untick one first.`
        )
      : null;

  return (
    // Mobile: pickers → comparison → AI comparison, one column. Desktop: the
    // comparison card spans both rows on the right, and the AI comparison sits
    // under the pickers on the left. Row 2 is `1fr` so the tall comparison card
    // stretches that row, not row 1 — otherwise the AI card would start below
    // the comparison's full height and leave a gap under the pickers.
    <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:grid-rows-[auto_1fr] md:gap-6 md:items-start">
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

        {/* Step 2 — tick 1〜3 of that person's measurements in one list. The
            box scrolls on its own: four rows and the top of a fifth on a phone
            (a box that ends exactly between two rows looks complete), more on
            desktop where the chart sits beside it. */}
        <MultiSelectList
          caption={t(
            `測定データを選択（${COMPARISON_MAX}件まで）`,
            `Choose measurements (up to ${COMPARISON_MAX})`
          )}
          options={recordOptions}
          values={pickedIds}
          onToggle={togglePick}
          max={COMPARISON_MAX}
          hint={listHint}
          scrollClassName="max-h-[min(20rem,44svh)] md:max-h-[26rem]"
        />
      </div>

      <div className="flex flex-col gap-6 md:col-start-2 md:row-start-1 md:row-span-2">
        {series.length === 0 && (
          // 本人が全部のチェックを外したとき。空けたままにすると、比較の場所が
          // 消えただけに見えるので、ここに何が出るのかを書いておく。
          <div className="bg-surface border border-surface-border rounded-3xl p-6 neu-raised text-center">
            <p className="text-base text-text-secondary">
              {t(
                `一覧から測定データを選ぶと、ここに6指標と脳波バランスが出ます。2〜${COMPARISON_MAX}件選ぶと並べて比較できます。`,
                `Choose measurements from the list to see their 6 indicators and brainwave balance here. Choose 2 to ${COMPARISON_MAX} to compare them side by side.`
              )}
            </p>
          </div>
        )}
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
                        "一覧でもう1件チェックすると、並べて比較できます",
                        "Tick one more in the list to compare them side by side"
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

      {/* 2件以上を選んだら、AI が違いを言葉にする（1件の読み解きは脳特性チャートの
          「AIによる分析」）。 */}
      {canCompare && (
        <div className="md:col-start-1 md:row-start-2">
          <BrainAiCompare measurements={series} />
        </div>
      )}
    </div>
  );
}
