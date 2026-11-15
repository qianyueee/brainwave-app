import { useMindStore } from "@/store/useMindStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import type { TreatmentPhase } from "@/lib/before-after";

/**
 * Keeps the free-text memo — and the 施術のタイミング (treatmentPhase) — in sync
 * between a realtime mind-map session (useMindStore) and the 脳特性 measurement
 * it was imported into (useBrainProfileStore). The two are linked by timestamp:
 * a measurement's `uploadedAt` is `new Date(session.startedAt).toISOString()`.
 *
 * Each helper writes ONLY the two stores' own note setters (which touch just
 * their own state), so editing on either side updates the other without any
 * feedback loop. A no-op when the counterpart doesn't exist (session not yet
 * imported, or a file-upload measurement with no session).
 */

function pushToMeasurement(uploadedAt: string, note: string) {
  const bp = useBrainProfileStore.getState();
  if (bp.measurements.some((m) => m.uploadedAt === uploadedAt)) {
    bp.setMeasurementNote(uploadedAt, note).catch((e) =>
      console.error("[note-sync] measurement update failed:", e)
    );
  }
}

function pushToMindSession(startedAt: number, note: string) {
  const mind = useMindStore.getState();
  const sess = mind.sessions.find((s) => s.startedAt === startedAt);
  if (sess) mind.setSessionNote(sess.id, note);
}

/** Save a note edited in the mind-map 過去の測定 list; mirror to its measurement. */
export function syncNoteFromSession(
  session: { id: string; startedAt: number },
  note: string
) {
  useMindStore.getState().setSessionNote(session.id, note);
  pushToMeasurement(new Date(session.startedAt).toISOString(), note);
}

/** Save a note edited on a 脳特性/log measurement; mirror to its mind session. */
export function syncNoteFromMeasurement(uploadedAt: string, note: string) {
  useBrainProfileStore
    .getState()
    .setMeasurementNote(uploadedAt, note)
    .catch((e) => console.error("[note-sync] measurement update failed:", e));
  pushToMindSession(Date.parse(uploadedAt), note);
}

/**
 * 施術のタイミングを測定セッションで選んだ（測り終えたダイアログ）。取り込み済みの
 * 記録があればそちらにも写す。
 */
export function syncPhaseFromSession(
  session: { id: string; startedAt: number },
  phase: TreatmentPhase | undefined
) {
  useMindStore.getState().setSessionPhase(session.id, phase);
  const uploadedAt = new Date(session.startedAt).toISOString();
  const bp = useBrainProfileStore.getState();
  if (bp.measurements.some((m) => m.uploadedAt === uploadedAt)) {
    bp.setMeasurementPhase(uploadedAt, phase).catch((e) =>
      console.error("[note-sync] measurement phase update failed:", e)
    );
  }
}

/** 施術のタイミングを記録のカード（ヒストリー）で選んだ。測定セッションにも写す。 */
export function syncPhaseFromMeasurement(uploadedAt: string, phase: TreatmentPhase | undefined) {
  useBrainProfileStore
    .getState()
    .setMeasurementPhase(uploadedAt, phase)
    .catch((e) => console.error("[note-sync] measurement phase update failed:", e));
  const mind = useMindStore.getState();
  const sess = mind.sessions.find((s) => s.startedAt === Date.parse(uploadedAt));
  if (sess) mind.setSessionPhase(sess.id, phase);
}
