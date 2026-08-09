import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SessionLog {
  id: string;
  programId: string;
  programName: string;
  date: string; // ISO date string
  duration: number; // seconds played
  mood: string;
}

interface AppState {
  // Program selection (persisted — a page refresh must not fall back to the
  // default program while the player page is open)
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
  /**
   * 実際に鳴っているプログラムの id（音声の真実）。AudioProvider の
   * start/stop だけが書く。表示側は useDisplayProgramId() 経由で
   * 「鳴っていればその id、でなければ選択中の id」を読む。
   */
  playingProgramId: string | null;
  setPlayingProgramId: (id: string | null) => void;
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

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedProgramId: "reset-deep",
      setSelectedProgramId: (id) => set({ selectedProgramId: id }),

      isPlaying: false,
      setIsPlaying: (v) => set({ isPlaying: v }),
      isPaused: false,
      setIsPaused: (v) => set({ isPaused: v }),
      playingProgramId: null,
      setPlayingProgramId: (id) => set({ playingProgramId: id }),
      timerDuration: 15 * 60,
      setTimerDuration: (d) => set({ timerDuration: d }),
      beatVolume: 0.2,
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
    }),
    {
      // Plain localStorage on purpose (like useZodiacStore): program choice,
      // timer and volumes are device preferences that must survive refreshes
      // for logged-out users too. Runtime state (isPlaying/elapsed/
      // playingProgramId) and sessionLogs stay in memory.
      name: "app-playback",
      partialize: (s) => ({
        selectedProgramId: s.selectedProgramId,
        timerDuration: s.timerDuration,
        beatVolume: s.beatVolume,
        musicVolume: s.musicVolume,
        natureVolume: s.natureVolume,
        natureSoundId: s.natureSoundId,
      }),
    }
  )
);

/**
 * 表示用の「生効プログラム id」：セッションが生きていれば実際に鳴っている
 * playingProgramId、でなければ選択中の selectedProgramId。プレーヤー画面と
 * その子コンポーネントは selectedProgramId を直読みせずこれを使う。
 */
export function useDisplayProgramId(): string {
  return useAppStore(
    (s) => (s.isPlaying && s.playingProgramId) || s.selectedProgramId
  );
}
