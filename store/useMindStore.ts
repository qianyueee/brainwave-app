import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EegSample } from "@/lib/mind/types";
import {
  getQuadrant,
  gammaRatio,
  gammaBoostFromRatio,
  boostedPosition,
  programBoostFromElapsed,
  combineZoneBoost,
  GAMMA_BASELINE_ALPHA,
} from "@/lib/mind/types";
import type { SourceStatus } from "@/lib/mind/data-source";
import { useAppStore } from "./useAppStore";

export type MindSourceKind = "demo" | "realtime";

export interface MindSessionSummary {
  id: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  avgAttention: number;
  avgMeditation: number;
  avgGammaRatio: number;
  /** % of samples spent in the flow quadrant（ゾーン率）. */
  flowRatioPct: number;
  source: MindSourceKind;
}

/** Last 5 minutes of 1 Hz samples kept for the trend chart. */
const HISTORY_MAX = 300;

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Pairing code alphabet without ambiguous characters (no 0/O/1/I/L).
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A short, human-typeable pairing code shown on the phone, e.g. "AB23-CD45". */
function generatePairingCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

interface MindState {
  sourceKind: MindSourceKind;
  status: SourceStatus;
  statusDetail: string;
  bridgeOnline: boolean;
  latestSample: EegSample | null;
  history: EegSample[];
  gammaBaseline: number; // per-session resting gamma EMA (not persisted)
  gammaBoost: number; // current 0..GAMMA_BOOST_MAX gamma-only pull toward the Zone
  zoneBoost: number; // gamma + program pull, used for the displayed position
  isRecording: boolean;
  recordingStartedAt: number | null;
  recordingSamples: EegSample[]; // in-memory only, never persisted
  recordingFlowCount: number; // Zone samples (gamma-boosted) during recording
  lastRecording: EegSample[] | null; // samples of the most recent finished measurement (for 脳特性 import)
  lastRecordingImported: boolean; // true once the last measurement was imported into 脳特性
  sessions: MindSessionSummary[];
  pairingCode: string;

  ensurePairingCode: () => void;
  setSourceKind: (k: MindSourceKind) => void;
  setStatus: (status: SourceStatus, detail?: string) => void;
  setBridgeOnline: (online: boolean) => void;
  pushSample: (s: EegSample) => void;
  startRecording: () => void;
  stopRecording: () => void;
  markRecordingImported: () => void;
  deleteSession: (id: string) => void;
}

export const useMindStore = create<MindState>()(
  persist(
    (set, get) => ({
      sourceKind: "demo",
      status: "idle",
      statusDetail: "",
      bridgeOnline: false,
      latestSample: null,
      history: [],
      gammaBaseline: 0,
      gammaBoost: 0,
      zoneBoost: 0,
      isRecording: false,
      recordingStartedAt: null,
      recordingSamples: [],
      recordingFlowCount: 0,
      lastRecording: null,
      lastRecordingImported: false,
      sessions: [],
      pairingCode: "",

      ensurePairingCode: () => {
        if (!get().pairingCode) set({ pairingCode: generatePairingCode() });
      },

      setSourceKind: (k) =>
        // Switching source resets the live state and aborts any in-progress
        // recording — its samples came from a different source and mixing them
        // would corrupt the measurement.
        set({
          sourceKind: k,
          latestSample: null,
          history: [],
          bridgeOnline: false,
          gammaBaseline: 0,
          gammaBoost: 0,
          zoneBoost: 0,
          isRecording: false,
          recordingStartedAt: null,
          recordingSamples: [],
          recordingFlowCount: 0,
          lastRecording: null,
          lastRecordingImported: false,
        }),

      setStatus: (status, detail) => set({ status, statusDetail: detail ?? "" }),

      setBridgeOnline: (online) => set({ bridgeOnline: online }),

      pushSample: (s) =>
        set((state) => {
          // Update the per-session gamma baseline (seed on first sample) and
          // derive the current pull toward the Zone.
          const ratio = gammaRatio(s);
          const baseline =
            state.gammaBaseline <= 0
              ? ratio
              : state.gammaBaseline + (ratio - state.gammaBaseline) * GAMMA_BASELINE_ALPHA;
          const gammaBoost = gammaBoostFromRatio(ratio, baseline);

          // While a program is playing, add a pull toward the Zone that ramps in
          // over the first minutes, so measuring during a session visibly
          // reflects its intended effect. With nothing playing this is 0 and
          // zoneBoost === gammaBoost (unchanged behavior).
          const app = useAppStore.getState();
          const program = programBoostFromElapsed(app.isPlaying, app.elapsed);
          const zoneBoost = combineZoneBoost(gammaBoost, program);

          let recordingSamples = state.recordingSamples;
          let recordingFlowCount = state.recordingFlowCount;
          if (state.isRecording) {
            recordingSamples = [...state.recordingSamples, s];
            const eff = boostedPosition(s.attention, s.meditation, zoneBoost);
            if (getQuadrant(eff.attention, eff.meditation) === "flow") {
              recordingFlowCount += 1;
            }
          }

          return {
            latestSample: s,
            history: [...state.history, s].slice(-HISTORY_MAX),
            gammaBaseline: baseline,
            gammaBoost,
            zoneBoost,
            recordingSamples,
            recordingFlowCount,
          };
        }),

      startRecording: () =>
        // Re-anchor the gamma baseline at measurement start (= resting state
        // before the 40Hz session), so the rise during treatment is captured.
        set({
          isRecording: true,
          recordingStartedAt: Date.now(),
          recordingSamples: [],
          recordingFlowCount: 0,
          lastRecording: null,
          lastRecordingImported: false,
          gammaBaseline: 0,
        }),

      stopRecording: () => {
        const { recordingSamples, recordingStartedAt, recordingFlowCount, sourceKind, sessions } =
          get();
        const endedAt = Date.now();
        if (recordingSamples.length === 0 || recordingStartedAt === null) {
          set({
            isRecording: false,
            recordingStartedAt: null,
            recordingSamples: [],
            recordingFlowCount: 0,
            lastRecording: null,
            lastRecordingImported: false,
          });
          return;
        }
        const n = recordingSamples.length;
        let attSum = 0;
        let medSum = 0;
        let gammaSum = 0;
        for (const s of recordingSamples) {
          attSum += s.attention;
          medSum += s.meditation;
          gammaSum += gammaRatio(s);
        }
        const summary: MindSessionSummary = {
          id: generateId(),
          startedAt: recordingStartedAt,
          endedAt,
          durationSec: Math.round((endedAt - recordingStartedAt) / 1000),
          avgAttention: Math.round(attSum / n),
          avgMeditation: Math.round(medSum / n),
          avgGammaRatio: Math.round((gammaSum / n) * 10) / 10,
          // Zone rate reflects the gamma-boosted position the user actually saw.
          flowRatioPct: Math.round((recordingFlowCount / n) * 100),
          source: sourceKind,
        };
        set({
          isRecording: false,
          recordingStartedAt: null,
          recordingSamples: [],
          recordingFlowCount: 0,
          // Keep the raw per-second samples so the user can import this
          // measurement into their 脳特性 chart from the recorder UI.
          lastRecording: recordingSamples,
          lastRecordingImported: false,
          sessions: [summary, ...sessions].slice(0, 100),
        });
      },

      markRecordingImported: () => set({ lastRecordingImported: true }),

      deleteSession: (id) =>
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),
    }),
    {
      name: "mind-map",
      partialize: (state) => ({
        sessions: state.sessions,
        sourceKind: state.sourceKind,
        pairingCode: state.pairingCode,
      }),
    }
  )
);
