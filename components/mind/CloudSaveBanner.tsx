"use client";

import { useMemo, useSyncExternalStore } from "react";
import { CloudUpload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { unassignedRecords } from "@/lib/sync/cloud-mark";
import { useMindStore } from "@/store/useMindStore";
import { useBaselineStore } from "@/store/useBaselineStore";
import { useCloudSyncStore } from "@/store/useCloudSyncStore";

const subscribeNoop = () => () => {};

/**
 * ログインしたのに、まだどのアカウントにも保存していない記録がこの PC に残って
 * いるときの問いかけ（デスクトップ測定アプリ /desktop 専用）。対象は、ログイン
 * する前に測った実測と、この機能より前にアプリへ溜まっていた記録。
 *
 * 黙って今のアカウントへ送らずに尋ねるのは、共用 PC で別の人の測定がその人の
 * アカウントへ流れ込むのを防ぐため。「保存しない」と答えた記録はこの PC にだけ
 * 残り、以後は尋ねない。
 */
export default function CloudSaveBanner() {
  const account = useCloudSyncStore((s) => s.account);
  const sessions = useMindStore((s) => s.sessions);
  const checks = useBaselineStore((s) => s.checks);
  const assignSessions = useMindStore((s) => s.assignSessions);
  const skipSessions = useMindStore((s) => s.markSessionsLocalOnly);
  const assignChecks = useBaselineStore((s) => s.assignChecks);
  const skipChecks = useBaselineStore((s) => s.markChecksLocalOnly);

  // persist 由来の記録を読むので mount 後に出す（hydration 対策）。
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const { sessionIds, checkIds } = useMemo(
    () => unassignedRecords(sessions, checks),
    [sessions, checks]
  );
  const total = sessionIds.length + checkIds.length;

  if (!supabase || !mounted || !account || total === 0) return null;

  const counts = [
    sessionIds.length ? `測定 ${sessionIds.length}件` : null,
    checkIds.length ? `10秒チェック ${checkIds.length}件` : null,
  ]
    .filter(Boolean)
    .join("・");

  return (
    <section
      aria-label="アカウントに保存していない記録"
      className="bg-surface border border-surface-border rounded-3xl p-5 flex flex-col gap-3 neu-raised"
    >
      <div className="flex items-start gap-3">
        <CloudUpload size={24} className="shrink-0 text-primary mt-0.5" />
        <div className="flex flex-col gap-1">
          <p className="text-base font-bold text-text-primary">
            このPCに、アカウントに保存していない記録があります（{counts}）
          </p>
          <p className="text-sm text-text-secondary">
            ログインする前に測った記録です。このアカウント（{account.email}）に保存しますか？
          </p>
          <p className="text-xs text-text-muted">
            以前に「合成データでテスト」した記録は実測と区別できないため、含まれることがあります。
            保存したあとでも Web版のヒストリーから削除できます。
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => {
            skipSessions(sessionIds);
            skipChecks(checkIds);
          }}
          className="flex-1 min-h-12 rounded-2xl bg-navy text-text-secondary text-base font-bold neu-raised-sm neu-press"
        >
          保存しない
        </button>
        <button
          onClick={() => {
            assignSessions(sessionIds, account.id);
            assignChecks(checkIds, account.id);
          }}
          className="flex-1 min-h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press"
        >
          このアカウントに保存する
        </button>
      </div>
    </section>
  );
}
