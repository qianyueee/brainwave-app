"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Check, ChevronRight, Flame, Target } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  DAILY_GOAL_MIN,
  WEEKLY_GOAL_MIN,
  goalProgress,
  secondsByDay,
  summarizeListening,
  wholeMinutes,
  type ListeningSummary,
} from "@/lib/listening-record";
import { useAppStore } from "@/store/useAppStore";
import { usePlaybackHistory } from "@/store/usePlaybackHistoryStore";
import { useTreeToday } from "@/store/useSyncTreeStore";

/**
 * リスニング記録 — ホームの Sync Tree カードの下半分（components/SyncTreeCard）。
 *
 * 1行目＝連続記録（N日連続・N週連続）、その下＝リスニング目標（今日・今週の分と帯）。
 * 決めごとと目標の値は lib/listening-record.ts。タップでヒストリー（聴いた日がカレンダーに
 * 並ぶ）。
 *
 * 連続と目標を左右に並べない（参考にした画面は左右）：幅 360 の画面で本文 14〜16px だと
 * 右半分の帯が 100px ほどしか残らず、英語（"This week"・"min"）や3桁の数（「125 / 100分」
 * 「400 日連続」）では帯が消えるか右へはみ出す。縦に積めば帯はどの幅でも残り、連続の行は
 * 入りきらなければ折り返す。
 *
 * 木と違ってログインしていなくても出す——再生の記録は端末に残り、ログイン中はどの
 * 端末で聴いた分も入る。数字を出すのは日数と分だけで、木のポイントは出さない
 * （lib/sync-tree.ts）。
 */

/**
 * いまのリスニング記録。サーバ描画と hydration の間は null——再生の記録も「今日」も
 * 端末のもので、静的 HTML に焼くと別の値と食い違う。
 *
 * いま鳴っている再生の経過秒も足す（記録は止めた・終わったときに書かれる）。止めた
 * 瞬間に記録が1件増えて経過秒が 0 に戻るのは同じ処理の中なので、二重には数えない。
 */
export function useListeningSummary(): ListeningSummary | null {
  const logs = usePlaybackHistory();
  const today = useTreeToday();
  // プログラムの再生だけ（素のシンセ・タイムラインのプレビューは再生の記録にならない）。
  const liveSec = useAppStore((s) => (s.isPlaying && s.playingProgramId !== null ? s.elapsed : 0));
  const byDay = useMemo(() => secondsByDay(logs), [logs]);
  return useMemo(
    () => (today ? summarizeListening(byDay, today, liveSec) : null),
    [byDay, today, liveSec]
  );
}

/** 目標の帯。読み上げは横の数字が受け持つので、帯そのものは装飾。 */
function GoalBar({ ratio }: { ratio: number }) {
  return (
    <span
      aria-hidden="true"
      className="block h-2.5 rounded-full bg-navy-lighter overflow-hidden"
      style={{ boxShadow: "inset 1px 1px 3px var(--shadow-neu-dark)" }}
    >
      <span
        className="block h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          background: "linear-gradient(to right, var(--dyn-accent-dark), var(--dyn-accent))",
        }}
      />
    </span>
  );
}

function StreakCell({ value, unit }: { value: number | null; unit: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <b className="text-2xl font-bold tabular-nums text-text-primary">{value ?? "—"}</b>
      <span className="text-sm text-text-secondary">{unit}</span>
    </span>
  );
}

/** 「今日」「今週」の1行ぶん（見出し・帯・分）。グリッドの3列に1つずつ入る。 */
function GoalCells({ label, sec, goalMin }: { label: string; sec: number | null; goalMin: number }) {
  const t = useT();
  const minutes = sec === null ? null : wholeMinutes(sec);
  const reached = minutes !== null && minutes >= goalMin;
  return (
    <>
      <span className="self-baseline text-sm text-text-secondary whitespace-nowrap">{label}</span>
      <GoalBar ratio={sec === null ? 0 : goalProgress(sec, goalMin)} />
      <span className="self-baseline flex items-baseline justify-end gap-0.5 text-sm whitespace-nowrap tabular-nums">
        {reached && <Check size={14} strokeWidth={2.5} className="self-center text-success" aria-hidden="true" />}
        <b className={`font-bold ${reached ? "text-success" : "text-text-primary"}`}>{minutes ?? "—"}</b>
        <span className="text-text-secondary">{t(` / ${goalMin}分`, ` / ${goalMin} min`)}</span>
      </span>
    </>
  );
}

export default function ListeningRecord({ className = "" }: { className?: string }) {
  const t = useT();
  const s = useListeningSummary();
  const lit = s !== null && (s.dayStreak > 0 || s.weekStreak > 0);
  const days = s?.dayStreak ?? null;
  const weeks = s?.weekStreak ?? null;

  return (
    <Link href="/history" className={`block ${className}`}>
      {/* 1行目＝連続記録（見出しと N日連続・N週連続）。狭い画面で入りきらなければ折り返す
          （矢印は右端に残る）。 */}
      <span className="flex items-center gap-2">
        <span className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
          <span className="text-sm text-text-secondary whitespace-nowrap">
            <Flame
              size={16}
              strokeWidth={1.75}
              className={`inline-block align-[-0.15em] mr-1 ${lit ? "text-warning" : "text-text-muted"}`}
              aria-hidden="true"
            />
            {t("連続記録", "Streak")}
          </span>
          <StreakCell value={days} unit={t("日連続", days === 1 ? "day" : "days")} />
          <StreakCell value={weeks} unit={t("週連続", weeks === 1 ? "week" : "weeks")} />
        </span>
        <ChevronRight size={20} className="shrink-0 text-text-muted" aria-hidden="true" />
      </span>

      {/* 2行目から＝リスニング目標。3列（見出し | 帯 | 分）を2行で共有するので、
          2本の帯の左端と右端が揃う。 */}
      <span className="mt-2 block text-sm text-text-secondary">
        <Target
          size={16}
          strokeWidth={1.75}
          className="inline-block align-[-0.15em] mr-1 text-accent"
          aria-hidden="true"
        />
        {t("リスニング目標", "Listening goal")}
      </span>
      <span className="mt-1 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
        <GoalCells label={t("今日", "Today")} sec={s?.todaySec ?? null} goalMin={DAILY_GOAL_MIN} />
        <GoalCells label={t("今週", "This week")} sec={s?.weekSec ?? null} goalMin={WEEKLY_GOAL_MIN} />
      </span>
    </Link>
  );
}
