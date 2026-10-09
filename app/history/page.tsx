"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePlaybackHistory } from "@/store/usePlaybackHistoryStore";
import { useRefreshAccountViewsOnMount } from "@/lib/sync/account-views";
import { intlLocale, useLocale, useT, type Locale } from "@/lib/i18n";
import SimpleCalendar from "@/components/SimpleCalendar";
import BaselineCheckList from "@/components/BaselineCheckList";
import { formatTreeDate } from "@/lib/sync-tree";
import { useSyncTreeView } from "@/store/useSyncTreeStore";
import { TreeDeciduous, ChevronRight } from "lucide-react";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";
import AccountSaveBanner from "@/components/AccountSaveBanner";

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

export default function HistoryPage() {
  const t = useT();
  const locale = useLocale();
  // 再生の記録（端末に残り、ログイン中はアカウントとも揃う。useAppStore.sessionLogs は
  // この起動のあいだだけの流れで、Sync Tree の積算用）。
  const sessionLogs = usePlaybackHistory();
  // Pick up records measured on another device (the desktop app) since the
  // last read — navigating here inside the app fires no focus event. The
  // calendar lists those measurements too.
  useRefreshAccountViewsOnMount();

  // Guard hydration mismatch from the persisted play history
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // 再生の記録は端末に残る（persist 由来）ので、数えるのは mount 後。
  const totalSessions = hydrated ? sessionLogs.length : 0;
  const totalMinutes = hydrated
    ? Math.round(sessionLogs.reduce((sum, log) => sum + log.duration, 0) / 60)
    : 0;

  // Sync Tree（ログイン中だけ・アカウントにある）。統計タイルと記録カードは
  // ホームのカード・/tree と同じストアを読むので、数字が食い違わない。
  const tree = useSyncTreeView();
  const completedTrees = tree.view === "ready" ? tree.fold.completed : [];

  return (
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      <PageHeader
        title="Sync History"
        subtitle={t("あなたのチューニング記録", "Your tuning records")}
      />

      <PageColumn>
      <AccountSaveBanner />

      {/* Mobile: single column. Desktop: stats+calendar | 10-second checks side by side. */}
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
      {/* 10秒チェックの記録 — 認証ゲートの外：このストアは素の localStorage
          なので未ログインでも記録が貯まる。（脳波の記録＝測定者 → 測定データの
          選択は Sync Report の「測定の比較」へ移した。ここではカレンダーの日付から
          その日の測定を開く。） */}
      <BaselineCheckList />
      </div>
      </div>
      </PageColumn>
    </div>
  );
}
