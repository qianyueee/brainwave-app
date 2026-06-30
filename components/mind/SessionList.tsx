"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ChevronRight } from "lucide-react";
import { useMindStore, type MindSessionSummary } from "@/store/useMindStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { formatTime } from "@/lib/utils";

/** Default number of rows shown before the 全て toggle is pressed. */
const DEFAULT_COUNT = 4;

function sessionLabel(s: MindSessionSummary): string {
  return new Date(s.startedAt).toLocaleString("ja-JP", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 過去の測定 list. Defaults to the latest DEFAULT_COUNT rows with a 全て toggle.
 * Tapping a row opens that measurement in the 脳特性 chart: it writes the
 * session's precomputed indicators + bands into the brain-profile store (login +
 * cloud-hydrate gated, deduped by the session's timestamp) and navigates there.
 */
export default function SessionList() {
  const sessions = useMindStore((s) => s.sessions);
  const deleteSession = useMindStore((s) => s.deleteSession);

  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const addMeasurement = useBrainProfileStore((s) => s.addMeasurement);
  const deleteMeasurement = useBrainProfileStore((s) => s.deleteMeasurement);
  const cloudUserId = useBrainProfileStore((s) => s.cloudUserId);

  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => setHydrated(true), []);

  const openInProfile = useCallback(
    async (s: MindSessionSummary) => {
      // Legacy sessions (recorded before this feature) carry no analysis data.
      if (!s.indicators || !s.bands) {
        router.push("/profile");
        return;
      }
      if (!user) {
        setPendingId(s.id);
        openAuthModal("login");
        return;
      }
      // Wait for the account's cloud data to load, else loadFromCloud would
      // overwrite the measurement we are about to add.
      if (!cloudUserId) {
        setPendingId(s.id);
        return;
      }
      setBusyId(s.id);
      try {
        const uploadedAt = new Date(s.startedAt).toISOString();
        // Upsert by timestamp so re-tapping the same session refreshes it to the
        // latest (shown) measurement instead of creating a duplicate.
        await deleteMeasurement(uploadedAt).catch(() => {});
        await addMeasurement({
          indicators: s.indicators,
          bands: s.bands,
          uploadedAt,
          sessionTag: sessionLabel(s),
        });
        setPendingId(null);
        router.push("/profile");
      } catch (e) {
        console.error("[mind] failed to open measurement in 脳特性:", e);
      } finally {
        setBusyId(null);
      }
    },
    [user, cloudUserId, openAuthModal, addMeasurement, deleteMeasurement, router]
  );

  // Resume a pending open once login + cloud hydrate complete.
  useEffect(() => {
    if (!pendingId || !user || !cloudUserId || busyId) return;
    const s = sessions.find((x) => x.id === pendingId);
    if (s) openInProfile(s);
    else setPendingId(null);
  }, [pendingId, user, cloudUserId, busyId, sessions, openInProfile]);

  const visible = hydrated ? (showAll ? sessions : sessions.slice(0, DEFAULT_COUNT)) : [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-text-primary">過去の測定</h2>
        {hydrated && sessions.length > DEFAULT_COUNT && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="px-3 py-1.5 rounded-xl border border-surface-border text-sm font-medium text-primary neu-raised-sm neu-press transition-transform"
          >
            {showAll ? "閉じる" : "全て"}
          </button>
        )}
      </div>

      {!hydrated || sessions.length === 0 ? (
        <p className="text-base text-text-secondary">まだ測定記録がありません</p>
      ) : (
        visible.map((s) => (
          <div
            key={s.id}
            className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex items-center justify-between gap-2"
          >
            <button
              onClick={() => openInProfile(s)}
              disabled={busyId === s.id}
              className="min-w-0 flex-1 text-left flex items-center gap-2 active:opacity-70"
            >
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-text-primary">
                  {sessionLabel(s)}
                  {s.source === "demo" && (
                    <span className="ml-2 text-xs font-normal text-text-muted">デモ</span>
                  )}
                </p>
                <p className="text-sm text-text-secondary">
                  {formatTime(s.durationSec)}・集中 {s.avgAttention}・リラックス {s.avgMeditation}
                  ・ゾーン率 {s.flowRatioPct}%
                </p>
                {busyId === s.id && (
                  <p className="text-xs text-primary mt-1">脳特性に取り込み中…</p>
                )}
                {pendingId === s.id && !user && (
                  <p className="text-xs text-text-muted mt-1">ログインすると脳特性で確認できます</p>
                )}
              </div>
              {s.indicators && (
                <ChevronRight size={20} className="shrink-0 text-text-muted" />
              )}
            </button>
            <button
              onClick={() => deleteSession(s.id)}
              aria-label="削除"
              className="shrink-0 w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-muted"
            >
              <Trash2 size={20} />
            </button>
          </div>
        ))
      )}
    </section>
  );
}
