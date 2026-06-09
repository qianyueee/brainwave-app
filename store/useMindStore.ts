import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EegSample } from "@/lib/mind/types";
import { getQuadrant, gammaRatio } from "@/lib/mind/types";
import type { SourceStatus } from "@/lib/mind/data-source";

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

interface MindState {
  sourceKind: MindSourceKind;
  status: SourceStatus;
  statusDetail: string;
  bridgeOnline: boolean;
  latestSample: EegSample | null;
  history: EegSample[];
  isRecording: boolean;
  recordingStartedAt: number | null;
  recordingSamples: EegSample[]; // in-memory only, never persisted
  sessions: MindSessionSummary[];

  setSourceKind: (k: MindSourceKind) => void;
  setStatus: (status: SourceStatus, detail?: string) => void;
  setBridgeOnline: (online: boolean) => void;
  pushSample: (s: EegSample) => void;
  startRecording: () => void;
  stopRecording: () => void;
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
      isRecording: false,
      recordingStartedAt: null,
      recordingSamples: [],
      sessions: [],

      setSourceKind: (k) =>
        set({ sourceKind: k, latestSample: null, history: [], bridgeOnline: false }),

      setStatus: (status, detail) => set({ status, statusDetail: detail ?? "" }),

      setBridgeOnline: (online) => set({ bridgeOnline: online }),

      pushSample: (s) =>
        set((state) => ({
          latestSample: s,
          history: [...state.history, s].slice(-HISTORY_MAX),
          recordingSamples: state.isRecording
            ? [...state.recordingSamples, s]
            : state.recordingSamples,
        })),

      startRecording: () =>
        set({ isRecording: true, recordingStartedAt: Date.now(), recordingSamples: [] }),

      stopRecording: () => {
        const { recordingSamples, recordingStartedAt, sourceKind, sessions } = get();
        const endedAt = Date.now();
        if (recordingSamples.length === 0 || recordingStartedAt === null) {
          set({ isRecording: false, recordingStartedAt: null, recordingSamples: [] });
          return;
        }
        const n = recordingSamples.length;
        let attSum = 0;
        let medSum = 0;
        let gammaSum = 0;
        let flowCount = 0;
        for (const s of recordingSamples) {
          attSum += s.attention;
          medSum += s.meditation;
          gammaSum += gammaRatio(s);
          if (getQuadrant(s.attention, s.meditation) === "flow") flowCount++;
        }
        const summary: MindSessionSummary = {
          id: generateId(),
          startedAt: recordingStartedAt,
          endedAt,
          durationSec: Math.round((endedAt - recordingStartedAt) / 1000),
          avgAttention: Math.round(attSum / n),
          avgMeditation: Math.round(medSum / n),
          avgGammaRatio: Math.round((gammaSum / n) * 10) / 10,
          flowRatioPct: Math.round((flowCount / n) * 100),
          source: sourceKind,
        };
        set({
          isRecording: false,
          recordingStartedAt: null,
          recordingSamples: [],
          sessions: [summary, ...sessions].slice(0, 100),
        });
      },

      deleteSession: (id) =>
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),
    }),
    {
      name: "mind-map",
      partialize: (state) => ({
        sessions: state.sessions,
        sourceKind: state.sourceKind,
      }),
    }
  )
);
