"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, BarChart3, Music, Timer } from "lucide-react";
import { usePlaybackHistory } from "@/store/usePlaybackHistoryStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAllBaselineChecks } from "@/store/useBaselineStore";
import { useJournalStore, type JournalEntry } from "@/store/useJournalStore";
import { useHistorySelectionStore } from "@/store/useHistorySelectionStore";
import { scoreColor } from "@/lib/brain-measurements";
import { moodColor } from "@/lib/journal";
import { buildDayRecords, recordedDayKeys, type DayRecordKind } from "@/lib/day-records";
import { intlLocale, useLocale, useT, type Locale, type LocalizedText } from "@/lib/i18n";
import DayJournal from "@/components/DayJournal";

const WEEKDAYS: readonly LocalizedText[] = [
  { ja: "日", en: "Sun" },
  { ja: "月", en: "Mon" },
  { ja: "火", en: "Tue" },
  { ja: "水", en: "Wed" },
  { ja: "木", en: "Thu" },
  { ja: "金", en: "Fri" },
  { ja: "土", en: "Sat" },
];

const cellKey = (y: number, m: number, d: number) => `${y}-${m}-${d}`;

/** 初回描画用の空。毎回 {} を作ると参照が毎回変わる。 */
const EMPTY_JOURNAL: Record<string, JournalEntry> = {};

const hhmm = (at: number, locale: Locale) =>
  new Date(at).toLocaleTimeString(intlLocale(locale), { hour: "2-digit", minute: "2-digit" });

const KIND_META: Record<DayRecordKind, { icon: typeof Music; color: string }> = {
  session: { icon: Music, color: "var(--dyn-accent)" },
  measurement: { icon: BarChart3, color: "var(--dyn-primary)" },
  check: { icon: Timer, color: "var(--dyn-primary)" },
};

/**
 * 月カレンダー。日付をタップするとその日の記録（セッション／脳波測定／10秒
 * チェック）が下に開く。
 *
 * ドットは2色のまま——セッション（accent）と脳波（primary）。10秒チェックに
 * 3色目を与えなかったのは、43px 角のセルに3つ並べると潰れるうえ、10秒チェックも
 * 脳波測定の一種なので「脳波の記録がある日」という意味は同じだから。どちらが
 * あったかは開いた明細が answers する。
 *
 * 振り返り（本人が書いたぶん）の印だけは**右上の角**に置く。下の2つと同じ列に
 * 3つ目を足すと上の理由で潰れるが、位置が違えば潰れないし、そもそも種類が違う
 * ——下はアプリが自動で残した記録、右上は本人が書いたもの。色はその日の調子を
 * そのまま持たせてあるので、月を眺めるだけで調子の並びが読める。
 *
 * 月送りを付けたのは、タップできるのに今月しか見られないと先月の記録に手が
 * 届かないため。未来の月へは進めない（記録が存在し得ない）。
 */
export default function SimpleCalendar() {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const sessionLogs = usePlaybackHistory();
  const measurements = useBrainProfileStore((s) => s.measurements);
  const setViewingMeasurement = useBrainProfileStore((s) => s.setViewingMeasurement);
  const checks = useAllBaselineChecks();
  const journalEntries = useJournalStore((s) => s.entries);

  // Persisted stores aren't available on the server / first paint; gate their
  // dots behind mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const now = new Date();
  // 表示中の月（0 = 今月、-1 = 先月）と開いている日。ページの外（ストア）に
  // 持つのは、明細の「レポートで見る」から戻ったときに同じ日が開いたままで
  // あるように——コンポーネントの state だと戻るたびに今月・閉じた状態に戻る。
  const monthOffset = useHistorySelectionStore((s) => s.calendarMonthOffset);
  const setMonthOffset = useHistorySelectionStore((s) => s.setCalendarMonthOffset);
  const selectedKey = useHistorySelectionStore((s) => s.calendarDayKey);
  const setSelectedKey = useHistorySelectionStore((s) => s.setCalendarDayKey);

  const viewing = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = viewing.getFullYear();
  const month = viewing.getMonth();

  // ドットは mounted まで出さない（再生の記録・脳波系・振り返りはどれも persist
  // 由来なので、初回描画で出すと hydration mismatch になる）。
  const dots = useMemo(
    () =>
      recordedDayKeys({
        sessionLogs: mounted ? sessionLogs : [],
        measurements: mounted ? measurements : [],
        checks: mounted ? checks : [],
      }),
    [sessionLogs, measurements, checks, mounted]
  );

  /** 振り返りも persist 由来なので、ドットと同じく mounted まで出さない。 */
  const journal = mounted ? journalEntries : EMPTY_JOURNAL;

  /** 選択日の明細。時刻順（古い→新しい）。 */
  const entries = useMemo(
    () =>
      selectedKey
        ? buildDayRecords({ sessionLogs, measurements, checks }, selectedKey, locale)
        : [],
    [selectedKey, sessionLogs, measurements, checks, locale]
  );

  const openOnReport = (uploadedAt: string) => {
    setViewingMeasurement(uploadedAt);
    router.push("/report");
  };

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isCurrentMonth = monthOffset === 0;

  const selectedLabel = selectedKey
    ? (() => {
        const [y, m, d] = selectedKey.split("-").map(Number);
        return new Date(y, m, d).toLocaleDateString(intlLocale(locale), {
          month: "long",
          day: "numeric",
          weekday: "short",
        });
      })()
    : "";

  const goMonth = (delta: number) => {
    setMonthOffset(Math.min(0, monthOffset + delta));
    setSelectedKey(null);
  };

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          onClick={() => goMonth(-1)}
          aria-label={t("前の月", "Previous month")}
          className="w-12 h-12 -my-2 shrink-0 rounded-xl flex items-center justify-center text-text-secondary active:scale-95"
        >
          <ChevronLeft size={20} />
        </button>
        <p className="text-base font-bold text-text-primary">
          {locale === "en"
            ? viewing.toLocaleDateString(intlLocale(locale), { year: "numeric", month: "long" })
            : `${year}年${month + 1}月`}
        </p>
        {/* 未来の月には記録が存在し得ないので、今月から先へは進めない。 */}
        <button
          onClick={() => goMonth(1)}
          disabled={isCurrentMonth}
          aria-label={t("次の月", "Next month")}
          className="w-12 h-12 -my-2 shrink-0 rounded-xl flex items-center justify-center text-text-secondary active:scale-95 disabled:opacity-30 disabled:active:scale-100"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w.ja} className="text-xs text-text-muted py-1">
            {t(w)}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const key = cellKey(year, month, day);
          const hasLog = dots.session.has(key);
          const hasBrain = dots.brain.has(key);
          const note = journal[key];
          const isToday = isCurrentMonth && day === now.getDate();
          const isSelected = selectedKey === key;
          return (
            <button
              key={i}
              onClick={() => setSelectedKey(isSelected ? null : key)}
              aria-pressed={isSelected}
              aria-label={
                locale === "en"
                  ? `Records for ${new Date(year, month, day).toLocaleDateString(intlLocale(locale), { month: "long", day: "numeric" })}`
                  : `${month + 1}月${day}日の記録`
              }
              className={`relative min-h-11 text-sm rounded-lg transition-colors ${
                isSelected
                  ? "bg-primary text-on-primary font-bold"
                  : isToday
                    ? "text-primary font-bold neu-inset"
                    : "text-text-secondary active:bg-navy"
              }`}
            >
              {day}
              {note && (
                <span
                  aria-hidden
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                  style={{
                    background: isSelected ? "var(--dyn-on-primary)" : moodColor(note.mood),
                  }}
                />
              )}
              {(hasLog || hasBrain) && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {hasLog && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: isSelected
                          ? "var(--dyn-on-primary)"
                          : "var(--dyn-accent)",
                      }}
                    />
                  )}
                  {hasBrain && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: isSelected
                          ? "var(--dyn-on-primary)"
                          : "var(--dyn-primary)",
                      }}
                    />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          {t("セッション", "Session")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {t("脳波測定", "Brainwave measurement")}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--dyn-text-secondary)" }}
          />
          {t("振り返り（右上）", "Reflection (top right)")}
        </span>
      </div>

      {/* 選択した日の明細。日付をもう一度タップすると閉じる。 */}
      {selectedKey && (
        <div className="mt-4 pt-4 border-t border-surface-border flex flex-col gap-3">
          <p className="text-base font-bold text-text-primary">{selectedLabel}</p>

          {entries.length === 0 ? (
            // 記録が無い日でも振り返りは書ける（下に続く）ので、言い切らない。
            <p className="text-sm text-text-secondary">
              {t("この日の記録はありません", "No records for this day")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map((e) => {
                const meta = KIND_META[e.kind];
                const Icon = meta.icon;
                const row = (
                  <>
                    <span
                      className="w-9 h-9 shrink-0 rounded-xl bg-navy neu-inset flex items-center justify-center"
                      style={{ color: meta.color }}
                    >
                      <Icon size={18} strokeWidth={1.5} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-xs font-mono tabular-nums text-text-muted shrink-0">
                          {hhmm(e.at, locale)}
                        </span>
                        <span className="min-w-0 truncate text-base font-bold text-text-primary">
                          {e.title}
                        </span>
                      </span>
                      {/* 見出しは truncate（メモは長くなりうる）が、detail は
                          折り返す。1行に詰めると「Rate 72…」の後ろにある
                          算出手法が丸ごと消えてしまい、どちらのロジックで
                          出た数字か分からなくなる。 */}
                      <span className="block text-xs text-text-muted line-clamp-2">
                        {e.detail}
                      </span>
                    </span>
                    {e.score != null && (
                      <span
                        className="shrink-0 text-lg font-mono font-bold tabular-nums"
                        style={{ color: scoreColor(e.score) }}
                      >
                        {e.score}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={e.id}>
                    {/* 測定はレポートで開ける。セッションと10秒チェックは
                        開く先が無いので、押せる見た目にしない。 */}
                    {e.uploadedAt ? (
                      <button
                        onClick={() => openOnReport(e.uploadedAt!)}
                        className="w-full flex items-center gap-3 min-h-14 px-3 rounded-2xl bg-navy text-left neu-raised-sm neu-press transition-transform"
                      >
                        {row}
                      </button>
                    ) : (
                      <div className="w-full flex items-center gap-3 min-h-14 px-3 rounded-2xl bg-navy neu-inset">
                        {row}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <DayJournal dayKey={selectedKey} />
        </div>
      )}
    </div>
  );
}
