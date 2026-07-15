import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BandPowers, EegSample } from "@/lib/mind/types";
import {
  getQuadrant,
  gammaRatio,
  gammaBoostFromRatio,
  gammaBoostScale,
  boostedPosition,
  programBoostFromElapsed,
  programGammaGain,
  withGammaGain,
  combineZoneBoost,
  averageSpectra,
  GAMMA_BASELINE_ALPHA,
} from "@/lib/mind/types";
import type { SourceStatus } from "@/lib/mind/data-source";
import type { BrainIndicators } from "@/lib/brain-profile";
import { computeIndicators, computeBandPowers, eegRowsFromSamples } from "@/lib/brain-profile";
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
  /** 6 indicators + 8-band balance computed at stop, so a past measurement can
   *  be opened in the 脳特性 chart without re-storing raw samples. Optional so
   *  sessions persisted before this feature still load. */
  indicators?: BrainIndicators;
  bands?: BandPowers;
  /** Session-average per-Hz FFT spectrum (1..SPECTRUM_MAX_HZ Hz). Realtime
   *  measurements only — the demo and the bridge provide it; uploads don't. */
  spectrum?: number[];
  /** Free-text memo the user can attach to a measurement (optional). */
  note?: string;
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
  sessions: MindSessionSummary[];
  pairingCode: string;

  ensurePairingCode: () => void;
  setSourceKind: (k: MindSourceKind) => void;
  setStatus: (status: SourceStatus, detail?: string) => void;
  setBridgeOnline: (online: boolean) => void;
  pushSample: (s: EegSample) => void;
  startRecording: () => void;
  /** Stops the recording and returns the finished session's summary (null if
   *  no samples were captured), so the UI can offer importing it right away. */
  stopRecording: () => MindSessionSummary | null;
  deleteSession: (id: string) => void;
  /** Set (or clear, with "") the free-text memo on a measurement. */
  setSessionNote: (id: string, note: string) => void;
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
        }),

      setStatus: (status, detail) => set({ status, statusDetail: detail ?? "" }),

      setBridgeOnline: (online) => set({ bridgeOnline: online }),

      pushSample: (rawSample) =>
        set((state) => {
          const app = useAppStore.getState();

          // While a program plays, amplify the measured γ bands (ramping in over
          // playback) so the γ ratio visibly rises — the 40Hz entrainment effect
          // made visible. The amplified sample IS the measurement from here on:
          // it feeds the live 脳波バランス, the recording, and the 脳特性 import
          // alike, so those stay consistent. Attention/Meditation are untouched.
          const s = withGammaGain(rawSample, programGammaGain(app.isPlaying, app.elapsed));

          // The Zone pull and the "γ波 上昇中" badge stay on the RAW γ, so the
          // badge remains an honest physiological signal and the dot pull is
          // unchanged — the program's contribution to the pull is the separate,
          // explicit programBoost below.
          const ratio = gammaRatio(rawSample);
          const baseline =
            state.gammaBaseline <= 0
              ? ratio
              : state.gammaBaseline + (ratio - state.gammaBaseline) * GAMMA_BASELINE_ALPHA;
          const gammaBoost = gammaBoostFromRatio(ratio, baseline);

          const program = programBoostFromElapsed(app.isPlaying, app.elapsed);
          const zoneBoost = combineZoneBoost(
            gammaBoost * gammaBoostScale(app.isPlaying, app.elapsed),
            program
          );

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
          });
          return null;
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
        // Compute the 6 indicators + 8-band balance now, so the measurement can
        // later be opened in the 脳特性 chart without keeping the raw samples.
        const rows = eegRowsFromSamples(recordingSamples);
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
          indicators: computeIndicators(rows),
          bands: computeBandPowers(rows),
          spectrum: averageSpectra(recordingSamples.map((s) => s.spectrum)),
        };
        set({
          isRecording: false,
          recordingStartedAt: null,
          recordingSamples: [],
          recordingFlowCount: 0,
          sessions: [summary, ...sessions].slice(0, 100),
        });
        return summary;
      },

      deleteSession: (id) =>
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),

      setSessionNote: (id, note) => {
        const trimmed = note.trim();
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, note: trimmed || undefined } : s
          ),
        }));
      },
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
