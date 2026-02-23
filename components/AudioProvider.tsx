"use client";

import {
  createContext,
  useContext,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { BinauralSession, getAudioContext } from "@/lib/audio-engine";
import { SynthSession, SynthLayer, TremoloConfig, VibratoConfig } from "@/lib/synth-engine";
import { ProgramConfig } from "@/lib/programs";
import type { CustomProgram } from "@/lib/programs";
import { NaturePlayer } from "@/lib/nature-player";
import { startKeepAlive, stopKeepAlive, setMediaSessionHandlers } from "@/lib/keep-alive";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";

interface AudioContextValue {
  startSession: (program: ProgramConfig, duration: number) => void;
  stopSession: () => void;
  getSession: () => BinauralSession | null;
  startSynth: (layers: SynthLayer[]) => void;
  stopSynth: () => void;
  getSynth: () => SynthSession | null;
  updateSynthLayer: (id: string, patch: Partial<Pick<SynthLayer, "frequency" | "volume" | "tone">>) => void;
  updateSynthLayerTremolo: (id: string, tremolo: TremoloConfig) => void;
  updateSynthVibrato: (vibrato: VibratoConfig) => void;
  // Custom program playback
  startCustomProgram: (program: CustomProgram, duration: number) => void;
  stopCustomProgram: () => void;
  // Nature sound routing (works with any active engine)
  playNatureSound: (soundId: string, volume: number) => void;
  stopNatureSound: () => void;
  setNatureVolume: (value: number) => void;
  // Synth volume control (for Mixer)
  setSynthVolume: (value: number) => void;
}

const AudioCtx = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const sessionRef = useRef<BinauralSession | null>(null);
  const synthRef = useRef<SynthSession | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const naturePlayerRef = useRef<NaturePlayer | null>(null);
  const customEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customStartTimeRef = useRef<number>(0);
  const customProgramRef = useRef<CustomProgram | null>(null);

  const setIsPlaying = useAppStore((s) => s.setIsPlaying);
  const setElapsed = useAppStore((s) => s.setElapsed);
  const addSessionLog = useAppStore((s) => s.addSessionLog);
  const beatVolume = useAppStore((s) => s.beatVolume);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const stopStandaloneNature = useCallback(() => {
    naturePlayerRef.current?.stop();
    naturePlayerRef.current = null;
  }, []);

  const stopSynth = useCallback(() => {
    if (synthRef.current?.isPlaying) {
      synthRef.current.stop();
    }
    synthRef.current = null;
    useSynthStore.getState().setIsSynthPlaying(false);
    if (!sessionRef.current?.isPlaying && !customProgramRef.current) {
      stopKeepAlive();
    }
  }, []);

  const stopCustomProgram = useCallback(() => {
    if (customEndTimerRef.current) {
      clearTimeout(customEndTimerRef.current);
      customEndTimerRef.current = null;
    }
    if (synthRef.current?.isPlaying) {
      synthRef.current.stop();
    }
    synthRef.current = null;
    stopStandaloneNature();
    stopPolling();
    customProgramRef.current = null;
    customStartTimeRef.current = 0;
    setIsPlaying(false);
    setElapsed(0);
    useSynthStore.getState().setIsSynthPlaying(false);
    if (!sessionRef.current?.isPlaying) {
      stopKeepAlive();
    }
  }, [stopPolling, stopStandaloneNature, setIsPlaying, setElapsed]);

  const stopSession = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    stopPolling();
    setIsPlaying(false);
    setElapsed(0);
    if (!synthRef.current?.isPlaying && !customProgramRef.current) {
      stopKeepAlive();
    }
  }, [stopPolling, setIsPlaying, setElapsed]);

  const startSession = useCallback(
    (program: ProgramConfig, duration: number) => {
      getAudioContext();
      stopSynth();
      stopCustomProgram();

      if (sessionRef.current?.isPlaying) {
        sessionRef.current.stop();
      }
      stopPolling();

      const session = new BinauralSession(program, duration);
      session.setVolume(beatVolume);
      session.onEnd(() => {
        addSessionLog({
          id: Date.now().toString(),
          programId: program.id,
          programName: program.name,
          date: new Date().toISOString(),
          duration: duration,
          mood: useAppStore.getState().mood,
        });
        stopSession();
      });

      session.start();
      sessionRef.current = session;
      setIsPlaying(true);
      setElapsed(0);

      startKeepAlive(program.name);
      setMediaSessionHandlers(
        () => {
          const ctx = getAudioContext();
          if (ctx.state === "suspended") ctx.resume();
        },
        () => {
          stopSession();
        },
      );

      const { natureSoundId, natureVolume } = useAppStore.getState();
      if (natureSoundId) {
        session.playNatureSound(natureSoundId, natureVolume);
      }

      pollRef.current = setInterval(() => {
        if (sessionRef.current?.isPlaying) {
          setElapsed(sessionRef.current.elapsed);
        }
      }, 1000);
    },
    [beatVolume, stopPolling, stopSession, stopSynth, stopCustomProgram, setIsPlaying, setElapsed, addSessionLog]
  );

  const startSynth = useCallback(
    (layers: SynthLayer[]) => {
      getAudioContext();
      stopSession();
      stopCustomProgram();

      if (synthRef.current?.isPlaying) {
        synthRef.current.stop();
      }

      const synth = new SynthSession();
      const { vibrato, isStereo, leftLayers, rightLayers } = useSynthStore.getState();
      if (isStereo) {
        synth.startStereo(leftLayers, rightLayers, vibrato);
      } else {
        synth.start(layers, vibrato);
      }
      synthRef.current = synth;
      useSynthStore.getState().setIsSynthPlaying(true);

      startKeepAlive("カスタム合成");
      setMediaSessionHandlers(
        () => {
          const ctx = getAudioContext();
          if (ctx.state === "suspended") ctx.resume();
        },
        () => {
          stopSynth();
        },
      );
    },
    [stopSession, stopSynth, stopCustomProgram]
  );

  const startCustomProgram = useCallback(
    (program: CustomProgram, duration: number) => {
      getAudioContext();
      stopSession();
      stopSynth();
      stopCustomProgram();

      const synth = new SynthSession();
      const preset = program.preset;
      const raw = preset.editorMode ?? "free";
      const isStereo = raw.endsWith("-stereo");

      if (isStereo && preset.leftLayers && preset.rightLayers) {
        synth.startStereo(preset.leftLayers, preset.rightLayers, preset.vibrato);
      } else {
        synth.start(preset.layers, preset.vibrato);
      }

      synthRef.current = synth;
      customProgramRef.current = program;
      useSynthStore.getState().setIsSynthPlaying(true);
      setIsPlaying(true);
      setElapsed(0);

      const ctx = getAudioContext();
      customStartTimeRef.current = ctx.currentTime;

      // Nature sound
      const { natureSoundId, natureVolume } = useAppStore.getState();
      if (natureSoundId) {
        const np = new NaturePlayer();
        np.play(natureSoundId, natureVolume);
        naturePlayerRef.current = np;
      }

      startKeepAlive(program.name);
      setMediaSessionHandlers(
        () => {
          const audioCtx = getAudioContext();
          if (audioCtx.state === "suspended") audioCtx.resume();
        },
        () => {
          stopCustomProgram();
        },
      );

      // Elapsed polling
      pollRef.current = setInterval(() => {
        if (customProgramRef.current && synthRef.current?.isPlaying) {
          const audioCtx = getAudioContext();
          const el = Math.min(audioCtx.currentTime - customStartTimeRef.current, duration);
          setElapsed(el);
        }
      }, 1000);

      // Auto-stop timer
      customEndTimerRef.current = setTimeout(() => {
        addSessionLog({
          id: Date.now().toString(),
          programId: program.id,
          programName: program.name,
          date: new Date().toISOString(),
          duration: duration,
          mood: useAppStore.getState().mood,
        });
        stopCustomProgram();
      }, duration * 1000);
    },
    [stopSession, stopSynth, stopCustomProgram, setIsPlaying, setElapsed, addSessionLog]
  );

  const getSynth = useCallback(() => synthRef.current, []);
  const getSession = useCallback(() => sessionRef.current, []);

  // --- Nature sound routing ---
  const playNatureSound = useCallback(
    (soundId: string, volume: number) => {
      // If binaural session is active, delegate to it
      if (sessionRef.current?.isPlaying) {
        sessionRef.current.playNatureSound(soundId, volume);
        return;
      }
      // For custom program or standalone synth, use standalone NaturePlayer
      stopStandaloneNature();
      const np = new NaturePlayer();
      np.play(soundId, volume);
      naturePlayerRef.current = np;
    },
    [stopStandaloneNature]
  );

  const stopNatureSound = useCallback(() => {
    if (sessionRef.current?.isPlaying) {
      sessionRef.current.stopNatureSound();
      return;
    }
    stopStandaloneNature();
  }, [stopStandaloneNature]);

  const setNatureVolume = useCallback((value: number) => {
    if (sessionRef.current?.isPlaying) {
      sessionRef.current.setNatureVolume(value);
      return;
    }
    naturePlayerRef.current?.setVolume(value);
  }, []);

  const setSynthVolume = useCallback((value: number) => {
    synthRef.current?.setMasterVolume(value);
  }, []);

  const updateSynthLayer = useCallback(
    (id: string, patch: Partial<Pick<SynthLayer, "frequency" | "volume" | "tone">>) => {
      const synth = synthRef.current;
      if (!synth?.isPlaying) return;

      if (patch.tone !== undefined) {
        const layer = useSynthStore.getState().layers.find((l) => l.id === id);
        if (layer) {
          synth.setLayerTone(id, patch.tone, { ...layer, ...patch });
        }
      } else {
        if (patch.frequency !== undefined) {
          synth.setLayerFrequency(id, patch.frequency);
        }
        if (patch.volume !== undefined) {
          synth.setLayerVolume(id, patch.volume);
        }
      }
    },
    []
  );

  const updateSynthLayerTremolo = useCallback(
    (id: string, tremolo: TremoloConfig) => {
      const synth = synthRef.current;
      if (!synth?.isPlaying) return;
      synth.setLayerTremolo(id, tremolo);
    },
    []
  );

  const updateSynthVibrato = useCallback(
    (vibrato: VibratoConfig) => {
      const synth = synthRef.current;
      if (!synth?.isPlaying) return;
      synth.setVibrato(vibrato);
    },
    []
  );

  return (
    <AudioCtx.Provider
      value={{
        startSession,
        stopSession,
        getSession,
        startSynth,
        stopSynth,
        getSynth,
        updateSynthLayer,
        updateSynthLayerTremolo,
        updateSynthVibrato,
        startCustomProgram,
        stopCustomProgram,
        playNatureSound,
        stopNatureSound,
        setNatureVolume,
        setSynthVolume,
      }}
    >
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
