import { create } from "zustand";

export interface SessionLog {
  id: string;
  programId: string;
  programName: string;
  date: string; // ISO date string
  duration: number; // seconds played
  mood: string;
}

interface AppState {
  // Program selection
  selectedProgramId: string;
  setSelectedProgramId: (id: string) => void;

  // Playback
  // isPlaying = セッションが生きている（再生中 or 一時停止中）。
  // isPaused はその内訳 — 既存の消費者（Timer 無効化・再生中保護・Mixer）は
  // 「アクティブかどうか」を見たいので isPlaying のままで正しい。
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  isPaused: boolean;
  setIsPaused: (v: boolean) => void;
  timerDuration: number; // seconds
  setTimerDuration: (d: number) => void;
  beatVolume: number; // 0-1
  setBeatVolume: (v: number) => void;
  natureVolume: number; // 0-1
  setNatureVolume: (v: number) => void;
  natureSoundId: string; // "" = none
  setNatureSoundId: (id: string) => void;
  /** 星座プログラムの音楽ベッド音量 0-1（誘導ビートの下に敷く伴奏） */
  musicVolume: number;
  setMusicVolume: (v: number) => void;
  elapsed: number;
  setElapsed: (e: number) => void;

  // Mood
  mood: string;
  setMood: (m: string) => void;

  // Session logs (in-memory only)
  sessionLogs: SessionLog[];
  addSessionLog: (log: SessionLog) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedProgramId: "reset-deep",
  setSelectedProgramId: (id) => set({ selectedProgramId: id }),

  isPlaying: false,
  setIsPlaying: (v) => set({ isPlaying: v }),
  isPaused: false,
  setIsPaused: (v) => set({ isPaused: v }),
  timerDuration: 15 * 60,
  setTimerDuration: (d) => set({ timerDuration: d }),
  beatVolume: 0.7,
  setBeatVolume: (v) => set({ beatVolume: v }),
  natureVolume: 0.5,
  setNatureVolume: (v) => set({ natureVolume: v }),
  natureSoundId: "",
  setNatureSoundId: (id) => set({ natureSoundId: id }),
  musicVolume: 0.6,
  setMusicVolume: (v) => set({ musicVolume: v }),
  elapsed: 0,
  setElapsed: (e) => set({ elapsed: e }),

  mood: "",
  setMood: (m) => set({ mood: m }),

  sessionLogs: [],
  addSessionLog: (log) =>
    set((state) => ({ sessionLogs: [...state.sessionLogs, log] })),
}));
