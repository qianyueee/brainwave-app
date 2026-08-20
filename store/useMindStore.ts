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
  combineZoneBoost,
  medianSpectrum,
  GAMMA_BASELINE_ALPHA,
  POOR_SIGNAL_LIMIT,
} from "@/lib/mind/types";
import type { SourceStatus } from "@/lib/mind/data-source";
import type { BrainIndicators } from "@/lib/brain-profile";
import {
  computeIndicators,
  computeBandPowers,
  countUsableSeconds,
  eegRowsFromSamples,
} from "@/lib/brain-profile";
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
  /** Seconds the headset actually read. 0 means every second was poor-signal,
   *  so the indicators are a meaningless all-zero and the measurement is not
   *  filed as a session. Optional so sessions persisted before this load. */
  usableSec?: number;
  /** Who this was measured on. The name is a snapshot taken at recording time,
   *  so renaming or deleting a subject never orphans past measurements.
   *  Undefined on recordings made before subjects existed. */
  subjectId?: string;
  subjectName?: string;
  /** 測定のときに入力した誘導周波数（Hz、0.01刻み）。Rate の共鳴率をこの周波数で
   *  見る。未入力なら undefined＝既定の 40Hz で判定する。測定者と同じく開始時に
   *  焼き込む——途中で入力欄をいじっても、走っている測定の条件は変わらない。 */
  targetHz?: number;
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

/**
 * データが実際に届いている状態か。デモは自給自足、リアルタイムはブリッジが
 * 生きていて初めて届く。「測定を開始」と「10秒クイックチェック」は同じ条件で
 * 開くべきなので、判定はここに一本化する（片方だけ押せる状態を作らない）。
 */
export const canReceiveData = (s: {
  status: SourceStatus;
  sourceKind: MindSourceKind;
  bridgeOnline: boolean;
}): boolean => s.status === "connected" && (s.sourceKind === "demo" || s.bridgeOnline);

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
  /** Subject captured when 測定開始 was pressed, so switching subjects mid-run
   *  cannot relabel a measurement that is already underway. */
  recordingSubject: { id: string; name: string } | null;
  /** 誘導周波数の入力値（Hz）。null＝未入力。設定として持ち回るので永続化する
   *  ——同じ音で測り続ける人に毎回打ち直させない。 */
  targetHz: number | null;
  /** 測定開始時に焼き込んだ誘導周波数（recordingSubject と同じ理由）。 */
  recordingTargetHz: number | null;
  sessions: MindSessionSummary[];
  pairingCode: string;

  ensurePairingCode: () => void;
  setSourceKind: (k: MindSourceKind) => void;
  setStatus: (status: SourceStatus, detail?: string) => void;
  setBridgeOnline: (online: boolean) => void;
  pushSample: (s: EegSample) => void;
  setTargetHz: (hz: number | null) => void;
  startRecording: (subject?: { id: string; name: string } | null) => void;
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
      recordingSubject: null,
      targetHz: null,
      recordingTargetHz: null,
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
          recordingSubject: null,
        }),

      setStatus: (status, detail) => set({ status, statusDetail: detail ?? "" }),

      setBridgeOnline: (online) => set({ bridgeOnline: online }),

      pushSample: (s) =>
        set((state) => {
          const app = useAppStore.getState();

          // The sample is stored exactly as the headset reported it. Playing a
          // program used to amplify its γ bands up to 3×, and since that
          // amplified copy was what got recorded, the pie, Clarity, Reset and
          // avgGammaRatio all reported a value no instrument had measured. The
          // program's effect on the display is the Zone pull below, which moves
          // the dot only and never touches the numbers that get saved.
          const ratio = gammaRatio(s);
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

      setTargetHz: (hz) => set({ targetHz: hz }),

      startRecording: (subject) =>
        // Re-anchor the gamma baseline at measurement start (= resting state
        // before the 40Hz session), so the rise during treatment is captured.
        set((state) => ({
          isRecording: true,
          recordingStartedAt: Date.now(),
          recordingSamples: [],
          recordingFlowCount: 0,
          recordingSubject: subject ?? null,
          recordingTargetHz: state.targetHz,
          gammaBaseline: 0,
        })),

      stopRecording: () => {
        const {
          recordingSamples,
          recordingStartedAt,
          recordingFlowCount,
          recordingSubject,
          recordingTargetHz,
          sourceKind,
          sessions,
        } = get();
        const endedAt = Date.now();
        if (recordingSamples.length === 0 || recordingStartedAt === null) {
          set({
            isRecording: false,
            recordingStartedAt: null,
            recordingSamples: [],
            recordingFlowCount: 0,
            recordingSubject: null,
            recordingTargetHz: null,
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
        const usableSec = countUsableSeconds(rows);
        const summary: MindSessionSummary = {
          usableSec,
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
          subjectId: recordingSubject?.id,
          subjectName: recordingSubject?.name,
          targetHz: recordingTargetHz ?? undefined,
          indicators: computeIndicators(rows),
          bands: computeBandPowers(rows),
          // Poor-contact seconds are excluded here for the same reason the
          // indicators and the band balance exclude them: with the electrodes
          // off the scalp the raw waveform is amplifier and mains pickup, not
          // brain activity. Its FFT magnitudes are far larger than real EEG, so
          // leaving those seconds in let a handful of them dominate the curve.
          spectrum: medianSpectrum(
            recordingSamples
              .filter((s) => (s.signal ?? 0) <= POOR_SIGNAL_LIMIT)
              .map((s) => s.spectrum)
          ),
        };
        set({
          isRecording: false,
          recordingStartedAt: null,
          recordingSamples: [],
          recordingFlowCount: 0,
          recordingSubject: null,
          recordingTargetHz: null,
          // A recording the headset never read is not a measurement — every
          // indicator is 0 for lack of data. Return it so the UI can say so,
          // but keep it out of 過去の測定 and out of the 脳特性 history.
          sessions: usableSec > 0 ? [summary, ...sessions].slice(0, 100) : sessions,
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
        targetHz: state.targetHz,
        pairingCode: state.pairingCode,
      }),
    }
  )
);
