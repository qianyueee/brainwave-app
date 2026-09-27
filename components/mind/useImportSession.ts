"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMindStore, type MindSessionSummary } from "@/store/useMindStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { measurementFromSession } from "@/lib/mind/session-record";

export type ImportStatus = "idle" | "busy" | "waitingLogin" | "waitingCloud" | "error";

/**
 * 測定 → 脳特性 import flow for the post-measurement prompt on /brain
 * (MindRecorder). It writes the session's precomputed indicators + bands into
 * the brain-profile store and navigates to /report (脳特性チャート). Login and
 * cloud-hydrate gated: a pending import resumes once both complete, and is keyed
 * by the session's timestamp so re-importing refreshes instead of duplicating.
 * Failures clear the pending marker (no endless retry) and are surfaced through
 * `statusFor` for the caller's UI. The session → record mapping is shared with
 * the desktop app's auto-save (lib/mind/session-record.ts).
 */
export function useImportSession() {
  const sessions = useMindStore((s) => s.sessions);
  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const addMeasurement = useBrainProfileStore((s) => s.addMeasurement);
  const setViewingMeasurement = useBrainProfileStore((s) => s.setViewingMeasurement);
  const cloudUserId = useBrainProfileStore((s) => s.cloudUserId);
  const router = useRouter();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const importSession = useCallback(
    async (s: MindSessionSummary) => {
      setErrorId(null);
      // Legacy sessions (recorded before this feature) carry no analysis data.
      const record = measurementFromSession(s);
      if (!record) {
        router.push("/report");
        return;
      }
      if (!user) {
        setPendingId(s.id);
        openAuthModal("login");
        return;
      }
      // Wait for the account's cloud data to load, else loadFromCloud would
      // replace the list we are about to add to.
      if (!cloudUserId) {
        setPendingId(s.id);
        return;
      }
      setBusyId(s.id);
      try {
        // Keyed by the session's start time, so re-importing the same session
        // replaces its record instead of creating a duplicate.
        await addMeasurement(record);
        // Show exactly this record on /report: a newer one measured on another
        // device (the desktop app) would otherwise be what "latest" opens on.
        setViewingMeasurement(record.uploadedAt);
        setPendingId(null);
        router.push("/report");
      } catch (e) {
        console.error("[mind] failed to import measurement into 脳特性:", e);
        // Clear the pending marker so the resume effect can't retry forever.
        setPendingId(null);
        setErrorId(s.id);
      } finally {
        setBusyId(null);
      }
    },
    [user, cloudUserId, openAuthModal, addMeasurement, setViewingMeasurement, router]
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
