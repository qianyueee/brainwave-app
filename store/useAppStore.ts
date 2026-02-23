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
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  timerDuration: number; // seconds
  setTimerDuration: (d: number) => void;
  beatVolume: number; // 0-1
  setBeatVolume: (v: number) => void;
  natureVolume: number; // 0-1
  setNatureVolume: (v: number) => void;
  natureSoundId: string; // "" = none
  setNatureSoundId: (id: string) => void;
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
  timerDuration: 15 * 60,
  setTimerDuration: (d) => set({ timerDuration: d }),
  beatVolume: 0.7,
  setBeatVolume: (v) => set({ beatVolume: v }),
  natureVolume: 0.5,
  setNatureVolume: (v) => set({ natureVolume: v }),
  natureSoundId: "",
  setNatureSoundId: (id) => set({ natureSoundId: id }),
  elapsed: 0,
  setElapsed: (e) => set({ elapsed: e }),

  mood: "",
  setMood: (m) => set({ mood: m }),

  sessionLogs: [],
  addSessionLog: (log) =>
    set((state) => ({ sessionLogs: [...state.sessionLogs, log] })),
}));
