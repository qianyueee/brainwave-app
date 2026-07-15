"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMindStore, type MindSessionSummary } from "@/store/useMindStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";

export function sessionLabel(s: MindSessionSummary): string {
  return new Date(s.startedAt).toLocaleString("ja-JP", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type ImportStatus = "idle" | "busy" | "waitingLogin" | "waitingCloud" | "error";

/**
 * Shared 測定 → 脳特性 import flow, used by both the post-measurement prompt
 * (MindRecorder) and the 過去の測定 list (SessionList). It writes the session's
 * precomputed indicators + bands into the brain-profile store and navigates to
 * /profile. Login and cloud-hydrate gated: a pending import resumes once both
 * complete, and is deduped by the session's timestamp so re-importing refreshes
 * instead of duplicating. Failures clear the pending marker (no endless retry)
 * and are surfaced through `statusFor` for the caller's UI.
 */
export function useImportSession() {
  const sessions = useMindStore((s) => s.sessions);
  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const addMeasurement = useBrainProfileStore((s) => s.addMeasurement);
  const deleteMeasurement = useBrainProfileStore((s) => s.deleteMeasurement);
  const cloudUserId = useBrainProfileStore((s) => s.cloudUserId);
  const router = useRouter();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const importSession = useCallback(
    async (s: MindSessionSummary) => {
      setErrorId(null);
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
        // Upsert by timestamp so re-importing the same session refreshes it to
        // the latest (shown) measurement instead of creating a duplicate.
        await deleteMeasurement(uploadedAt).catch(() => {});
        await addMeasurement({
          indicators: s.indicators,
          bands: s.bands,
          spectrum: s.spectrum,
          uploadedAt,
          sessionTag: sessionLabel(s),
        });
        setPendingId(null);
        router.push("/profile");
      } catch (e) {
        console.error("[mind] failed to import measurement into 脳特性:", e);
        // Clear the pending marker so the resume effect can't retry forever.
        setPendingId(null);
        setErrorId(s.id);
      } finally {
        setBusyId(null);
      }
    },
    [user, cloudUserId, openAuthModal, addMeasurement, deleteMeasurement, router]
  );

  // Resume a pending import once login + cloud hydrate complete.
  useEffect(() => {
    if (!pendingId || !user || !cloudUserId || busyId) return;
    const s = sessions.find((x) => x.id === pendingId);
    if (s) importSession(s);
    else setPendingId(null);
  }, [pendingId, user, cloudUserId, busyId, sessions, importSession]);

  /** Where a given session currently sits in this import flow (for row/dialog UI). */
  const statusFor = useCallback(
    (id: string): ImportStatus => {
      if (busyId === id) return "busy";
      if (pendingId === id) return user ? "waitingCloud" : "waitingLogin";
      if (errorId === id) return "error";
      return "idle";
    },
    [busyId, pendingId, errorId, user]
  );

  return { importSession, statusFor };
}
