"use client";

import { useMemo, useSyncExternalStore } from "react";
import { CloudUpload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isSessionUploadable, isUnassigned, unassignedRecords } from "@/lib/sync/cloud-mark";
import { ANON_SCOPE, countAskable } from "@/lib/sync/record-merge";
import { desktopFullAppSince } from "@/lib/desktop";
import { IS_DESKTOP_APP } from "@/lib/platform";
import { useMindStore } from "@/store/useMindStore";
import { useBaselineStore } from "@/store/useBaselineStore";
import { useCloudSyncStore } from "@/store/useCloudSyncStore";
import { useUserRecordsStore } from "@/store/useUserRecordsStore";
import { useLocale, useT } from "@/lib/i18n";

const subscribeNoop = () => () => {};

/**
 * ログインしたのに、まだどのアカウントにも保存していない記録がこの端末にあるときの
 * 問いかけ（ホームとヒストリーの上。Web・Android・Windows 共通）。
 *
 * 対象：
 * - ログインする前に書いた振り返り・再生の記録（store/useUserRecordsStore.ts の anon。
 *   マイ星座・感コンディション・測定者は尋ねない——アカウントに無ければ黙って引き継ぐ、
 *   lib/sync/record-merge.ts の KIND_RULES）
 * - ログインする前に取った実測の10秒チェック（宛先未定。lib/sync/cloud-mark.ts）
 * - Windows アプリでだけ：旧い測定アプリ（自動保存）が溜めた、宛先未定の測定
 *   （lib/desktop.ts の desktopFullAppSince より前）。完全版の測定は Web・Android と
 *   同じく「取り込む」で残すので、取り込まなかった測定を黙って送らない
 *
 * 黙って今のアカウントへ送らずに尋ねるのは、共用の端末で別の人の記録がその人の
 * アカウントへ流れ込むのを防ぐため。「保存しない」と答えた記録はこの端末にだけ残り、
 * 以後は尋ねない。文言は「ログインする前に」と決めつけない——以前の版では
 * ログイン中に書いた振り返りも端末にしか無かった。
 */
export default function AccountSaveBanner() {
  const account = useCloudSyncStore((s) => s.account);
  const checks = useBaselineStore((s) => s.checks);
  const sessions = useMindStore((s) => s.sessions);
  const assignChecks = useBaselineStore((s) => s.assignChecks);
  const skipChecks = useBaselineStore((s) => s.markChecksLocalOnly);
  const assignSessions = useMindStore((s) => s.assignSessions);
  const skipSessions = useMindStore((s) => s.markSessionsLocalOnly);
  const userScope = useUserRecordsStore((s) => (account ? s.scopes[account.id] : undefined));
  const anon = useUserRecordsStore((s) => s.scopes[ANON_SCOPE]);
  const t = useT();
  const en = useLocale() === "en";

  // persist 由来の記録を読むので mount 後に出す（hydration 対策）。
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const askable = useMemo(() => countAskable(userScope, anon), [userScope, anon]);
  const { checkIds } = useMemo(() => unassignedRecords([], checks), [checks]);
  const sessionIds = useMemo(() => {
    if (!IS_DESKTOP_APP || !mounted) return [];
    const since = desktopFullAppSince();
    if (since === null) return [];
    return sessions
      .filter((s) => isUnassigned(s.cloud) && isSessionUploadable(s) && s.endedAt < since)
      .map((s) => s.id);
  }, [sessions, mounted]);

  const journal = askable.journal ?? 0;
  const playback = askable.playback ?? 0;
  const total = journal + playback + checkIds.length + sessionIds.length;

  if (!supabase || !mounted || !account || total === 0) return null;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const counts = [
    sessionIds.length
      ? en
        ? plural(sessionIds.length, "measurement", "measurements")
        : `測定 ${sessionIds.length}件`
      : null,
    checkIds.length
      ? en
        ? plural(checkIds.length, "10-second check", "10-second checks")
        : `10秒チェック ${checkIds.length}件`
      : null,
    journal ? (en ? plural(journal, "day of reflections", "days of reflections") : `振り返り ${journal}日分`) : null,
    playback ? (en ? plural(playback, "play", "plays") : `再生 ${playback}回`) : null,
  ]
    .filter(Boolean)
    .join(en ? ", " : "・");

  const save = () => {
    useUserRecordsStore.getState().claimAnon(account.id);
    assignChecks(checkIds, account.id);
    assignSessions(sessionIds, account.id);
  };
  const skip = () => {
    useUserRecordsStore.getState().skipAnon();
    skipChecks(checkIds);
    skipSessions(sessionIds);
  };

  return (
    <section
      aria-label={t("アカウントに保存していない記録", "Records not saved to your account")}
      className="bg-surface border border-surface-border rounded-3xl p-5 flex flex-col gap-3 neu-raised"
    >
      <div className="flex items-start gap-3">
        <CloudUpload size={24} className="shrink-0 text-primary mt-0.5" />
        <div className="flex flex-col gap-1">
          <p className="text-base font-bold text-text-primary">
            {t(
              `この端末に、まだアカウントに保存していない記録があります（${counts}）`,
              `This device has records that aren't saved to your account yet (${counts})`
            )}
          </p>
          <p className="text-sm text-text-secondary">
            {t(
              `このアカウント（${account.email ?? "ログイン中のアカウント"}）に保存すると、ほかの端末 （Web・Android・Windows）でも同じ記録が見られます。`,
              `Save them to this account (${account.email ?? "the account you're logged in to"}) to see the same records on your other devices (web, Android, Windows).`
            )}
          </p>
          {sessionIds.length > 0 && (
            <p className="text-xs text-text-muted">
              {t(
                "以前に「合成データでテスト」した測定は実測と区別できないため、含まれることがあります。",
                "Measurements from earlier “Test with synthetic data” runs can't be told apart from real ones, so they may be included."
              )}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={skip}
          className="flex-1 min-h-12 rounded-2xl bg-navy text-text-secondary text-base font-bold neu-raised-sm neu-press"
        >
          {t("保存しない", "Don't save")}
        </button>
        <button
          onClick={save}
          className="flex-1 min-h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press"
        >
          {t("このアカウントに保存する", "Save to this account")}
        </button>
      </div>
    </section>
  );
}
