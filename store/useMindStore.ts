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
import {
  isSessionUploadable,
  needsUpload,
  sessionRev,
  type CloudMark,
} from "@/lib/sync/cloud-mark";
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
  /** アカウントへ保存するか・保存済みか（lib/sync/cloud-mark.ts）。デスクトップ
   *  測定アプリの自動保存だけが書く。/brain の回は取り込み（useImportSession）が
   *  別経路で送るので undefined のまま。 */
  cloud?: CloudMark;
  /** 測定後に中身（メモ）を書き換えるたびに +1。保存済みの版（cloud.savedRev）と
   *  比べて、アカウントへ送り直すかを決める。undefined は 0。 */
  rev?: number;
}

/** Last 5 minutes of 1 Hz samples kept for the trend chart. */
const HISTORY_MAX = 300;

/** 端末に残す測定の件数。アカウントへまだ送れていないものはこの外でも消さない。 */
const SESSIONS_MAX = 100;

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** アカウントへ送り終えていない測定か（宛先の誰かにとって未送信）。 */
function awaitingUpload(s: MindSessionSummary): boolean {
  const owner = s.cloud && "owner" in s.cloud ? s.cloud.owner : null;
  return owner !== null && needsUpload(s.cloud, sessionRev(s), owner);
}

/** 新しい順の一覧を SESSIONS_MAX 件に畳む。ただし未送信の測定は残す——オフラインで
 *  測り続けても、送る前に端末から消えないように。 */
function trimSessions(list: MindSessionSummary[]): MindSessionSummary[] {
  if (list.length <= SESSIONS_MAX) return list;
  return [...list.slice(0, SESSIONS_MAX), ...list.slice(SESSIONS_MAX).filter(awaitingUpload)];
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
  /** 録音中に合成データ（EegSample.synthetic）が1秒でも混ざったか。混ざった測定は
   *  source を "demo" として残す——実測と区別しないと、テストの数字がアカウントの
   *  脳特性の推移に紛れ込む。 */
  recordingSynthetic: boolean;
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
   *  no samples were captured), so the UI can offer importing it right away.
   *  `cloudOwner`（デスクトップの自動保存）：その測定をこのアカウントへ保存する
   *  予約を記録に焼き込む（載せてよい実測だけ）。 */
  stopRecording: (opts?: { cloudOwner?: string }) => MindSessionSummary | null;
  deleteSession: (id: string) => void;
  /** Set (or clear, with "") the free-text memo on a measurement. */
  setSessionNote: (id: string, note: string) => void;
  /** 版 `rev` の内容を `owner` のアカウントへ保存できた（同期処理が呼ぶ）。 */
  markSessionSaved: (id: string, owner: string, rev: number) => void;
  /** 宛先未定の測定を `owner` のアカウントへ保存する予約にする。 */
  assignSessions: (ids: readonly string[], owner: string) => void;
  /** 宛先未定の測定を「このPCだけに残す」にする（以後は尋ねない）。 */
  markSessionsLocalOnly: (ids: readonly string[]) => void;
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
      recordingSynthetic: false,
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
          recordingSynthetic: false,
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
          let recordingSynthetic = state.recordingSynthetic;
          if (state.isRecording) {
            recordingSamples = [...state.recordingSamples, s];
            if (s.synthetic) recordingSynthetic = true;
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
            recordingSynthetic,
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
          recordingSynthetic: false,
          gammaBaseline: 0,
        })),

      stopRecording: (opts) => {
        const {
          recordingSamples,
          recordingStartedAt,
          recordingFlowCount,
          recordingSubject,
          recordingTargetHz,
          recordingSynthetic,
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
            recordingSynthetic: false,
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
          // 合成データが混ざった測定はデモ扱い（実機の経路を通っていても脳波ではない）。
          source: recordingSynthetic ? "demo" : sourceKind,
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
        // デスクトップの自動保存：載せてよい実測だけ、測り終えた時点のアカウントへ
        // 予約する（デモ・合成・読めなかった測定は予約しない）。
        if (opts?.cloudOwner && isSessionUploadable(summary)) {
          summary.cloud = { owner: opts.cloudOwner };
        }
        set({
          isRecording: false,
          recordingStartedAt: null,
          recordingSamples: [],
          recordingFlowCount: 0,
          recordingSubject: null,
          recordingTargetHz: null,
          recordingSynthetic: false,
          // A recording the headset never read is not a measurement — every
          // indicator is 0 for lack of data. Return it so the UI can say so,
          // but keep it out of 過去の測定 and out of the 脳特性 history.
          sessions: usableSec > 0 ? trimSessions([summary, ...sessions]) : sessions,
        });
        return summary;
      },

      deleteSession: (id) =>
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),

      setSessionNote: (id, note) => {
        const next = note.trim() || undefined;
        set((state) => ({
          sessions: state.sessions.map((s) =>
            // 版を進めるのは中身が変わったときだけ（同じメモの再保存で送り直さない）。
            s.id === id && s.note !== next ? { ...s, note: next, rev: sessionRev(s) + 1 } : s
          ),
        }));
      },

      markSessionSaved: (id, owner, rev) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            // 送っている間に宛先が変わっていたら（あり得ないが）印を付けない。
            s.id === id && s.cloud && "owner" in s.cloud && s.cloud.owner === owner
              ? { ...s, cloud: { owner, savedRev: rev, savedAt: new Date().toISOString() } }
              : s
          ),
        })),

      assignSessions: (ids, owner) => {
        const pick = new Set(ids);
        set((state) => ({
          sessions: state.sessions.map((s) =>
            pick.has(s.id) && s.cloud === undefined && isSessionUploadable(s)
              ? { ...s, cloud: { owner } }
              : s
          ),
        }));
      },

      markSessionsLocalOnly: (ids) => {
        const pick = new Set(ids);
        set((state) => ({
          sessions: state.sessions.map((s) =>
            pick.has(s.id) && s.cloud === undefined ? { ...s, cloud: { localOnly: true } } : s
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
