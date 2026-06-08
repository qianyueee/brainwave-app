"use client";

import {
  createContext,
  useContext,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { BinauralSession, getAudioContext } from "@/lib/audio-engine";
import { SynthSession, SynthLayer, TimelineSegment, TremoloConfig, VibratoConfig, MonitorChannel } from "@/lib/synth-engine";
import { TimelineSession } from "@/lib/timeline-engine";
import { ProgramConfig } from "@/lib/programs";
import type { CustomProgram } from "@/lib/programs";
import { isTimelineProgram } from "@/lib/programs";
import { NaturePlayer } from "@/lib/nature-player";
import { getAudioBlob } from "@/lib/custom-audio-db";
import { ensureBlobCached } from "@/lib/sync/custom-audios";
import { startKeepAlive, stopKeepAlive, setMediaSessionHandlers } from "@/lib/keep-alive";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { useCustomAudioStore } from "@/store/useCustomAudioStore";

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
  // Timeline preview (synth editor): play an in-progress segment sequence
  startTimelinePreview: (segments: TimelineSegment[]) => void;
  // Nature sound routing (works with any active engine)
  playNatureSound: (soundId: string, volume: number) => void;
  stopNatureSound: () => void;
  setNatureVolume: (value: number) => void;
  // Synth volume control (for Mixer)
  setSynthVolume: (value: number) => void;
  // Solo monitor in stereo mode
  setMonitorChannel: (channel: MonitorChannel) => void;
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
  const timelineRef = useRef<TimelineSession | null>(null);

  const setIsPlaying = useAppStore((s) => s.setIsPlaying);
  const setElapsed = useAppStore((s) => s.setElapsed);
  const addSessionLog = useAppStore((s) => s.addSessionLog);

  const keepAliveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Delay stopKeepAlive so fade-out (200ms) completes before <audio> pauses
  const scheduleStopKeepAlive = useCallback(() => {
    if (keepAliveTimerRef.current) clearTimeout(keepAliveTimerRef.current);
    keepAliveTimerRef.current = setTimeout(() => {
      stopKeepAlive();
      keepAliveTimerRef.current = null;
    }, 350);
  }, []);

  const cancelStopKeepAlive = useCallback(() => {
    if (keepAliveTimerRef.current) {
      clearTimeout(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
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
      scheduleStopKeepAlive();
    }
  }, [scheduleStopKeepAlive]);

  const stopCustomProgram = useCallback(() => {
    if (customEndTimerRef.current) {
      clearTimeout(customEndTimerRef.current);
      customEndTimerRef.current = null;
    }
    if (timelineRef.current) {
      timelineRef.current.stop();
      timelineRef.current = null;
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
      scheduleStopKeepAlive();
    }
  }, [stopPolling, stopStandaloneNature, setIsPlaying, setElapsed, scheduleStopKeepAlive]);

  const stopSession = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    stopPolling();
    setIsPlaying(false);
    setElapsed(0);
    if (!synthRef.current?.isPlaying && !customProgramRef.current) {
      scheduleStopKeepAlive();
    }
  }, [stopPolling, setIsPlaying, setElapsed, scheduleStopKeepAlive]);

  const playCustomAudio = useCallback(
    async (soundId: string, volume: number) => {
      let blob = await getAudioBlob(soundId);
      if (!blob) {
        // Cloud-cache fallback: this device hasn't downloaded the blob yet
        const meta = useCustomAudioStore.getState().audios.find((a) => a.id === soundId);
        if (meta?.storagePath) {
          try {
            blob = await ensureBlobCached({
              id: meta.id,
              name: meta.name,
              mimeType: meta.mimeType,
              storagePath: meta.storagePath,
              sizeBytes: null,
              durationSec: null,
              createdAt: "",
            });
          } catch (err) {
            console.error("[audio-provider] failed to fetch custom audio:", err);
            return;
          }
        }
      }
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const np = new NaturePlayer();
      await np.playFromUrl(url, volume);
      naturePlayerRef.current = np;
    },
    []
  );

  const startSession = useCallback(
    (program: ProgramConfig, duration: number) => {
      cancelStopKeepAlive();
      getAudioContext();
      stopSynth();
      stopCustomProgram();

      if (sessionRef.current?.isPlaying) {
        sessionRef.current.stop();
      }
      stopPolling();

      const session = new BinauralSession(program, duration);
      const { beatVolume } = useAppStore.getState();
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

      session.start(beatVolume);
      sessionRef.current = session;
      setIsPlaying(true);
      setElapsed(0);

      cancelStopKeepAlive();
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
        if (natureSoundId.startsWith("custom-")) {
          playCustomAudio(natureSoundId, natureVolume);
        } else {
          session.playNatureSound(natureSoundId, natureVolume);
        }
      }

      pollRef.current = setInterval(() => {
        if (sessionRef.current?.isPlaying) {
          setElapsed(sessionRef.current.elapsed);
        }
      }, 1000);
    },
    [cancelStopKeepAlive, stopPolling, stopSession, stopSynth, stopCustomProgram, setIsPlaying, setElapsed, addSessionLog, playCustomAudio]
  );

  const startSynth = useCallback(
    (layers: SynthLayer[]) => {
      cancelStopKeepAlive();
      getAudioContext();
      stopSession();
      stopCustomProgram();

      if (synthRef.current?.isPlaying) {
        synthRef.current.stop();
      }

      const synth = new SynthSession();
      const { vibrato, isStereo, leftLayers, rightLayers, monitorChannel } = useSynthStore.getState();
      if (isStereo) {
        synth.startStereo(leftLayers, rightLayers, vibrato);
        synth.setMonitorChannel(monitorChannel);
      } else {
        synth.start(layers, vibrato);
      }
      synthRef.current = synth;
      useSynthStore.getState().setIsSynthPlaying(true);

      cancelStopKeepAlive();
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
    [cancelStopKeepAlive, stopSession, stopSynth, stopCustomProgram]
  );

  // Shared timeline starter — used by both timeline custom-program playback and
  // the synth editor's whole-timeline preview. `logInfo` is null for previews.
  const runTimeline = useCallback(
    (
      segments: TimelineSegment[],
      name: string,
      logInfo: { programId: string; programName: string } | null
    ) => {
      cancelStopKeepAlive();
      getAudioContext();
      stopSession();
      stopSynth();
      stopCustomProgram();

      if (segments.length === 0) return;

      const ts = new TimelineSession(segments);
      const { beatVolume } = useAppStore.getState();
      const { monitorChannel } = useSynthStore.getState();
      ts.start(beatVolume, monitorChannel);
      timelineRef.current = ts;
      useSynthStore.getState().setIsSynthPlaying(true);
      setIsPlaying(true);
      setElapsed(0);

      // Nature sound (same routing as a single custom program)
      const { natureSoundId, natureVolume } = useAppStore.getState();
      if (natureSoundId) {
        if (natureSoundId.startsWith("custom-")) {
          playCustomAudio(natureSoundId, natureVolume);
        } else {
          const np = new NaturePlayer();
          np.play(natureSoundId, natureVolume);
          naturePlayerRef.current = np;
        }
      }

      cancelStopKeepAlive();
      startKeepAlive(name);
      setMediaSessionHandlers(
        () => {
          const audioCtx = getAudioContext();
          if (audioCtx.state === "suspended") audioCtx.resume();
        },
        () => {
          stopCustomProgram();
        }
      );

      pollRef.current = setInterval(() => {
        if (timelineRef.current?.isPlaying) {
          setElapsed(timelineRef.current.elapsed);
        }
      }, 1000);

      ts.onEnd(() => {
        if (logInfo) {
          addSessionLog({
            id: Date.now().toString(),
            programId: logInfo.programId,
            programName: logInfo.programName,
            date: new Date().toISOString(),
            duration: ts.total,
            mood: useAppStore.getState().mood,
          });
        }
        stopCustomProgram();
      });
    },
    [cancelStopKeepAlive, stopSession, stopSynth, stopCustomProgram, setIsPlaying, setElapsed, addSessionLog, playCustomAudio]
  );

  const startTimelinePreview = useCallback(
    (segments: TimelineSegment[]) => {
      runTimeline(segments, "タイムライン プレビュー", null);
    },
    [runTimeline]
  );

  const startCustomProgram = useCallback(
    (program: CustomProgram, duration: number) => {
      if (isTimelineProgram(program)) {
        runTimeline(program.preset.timeline!.segments, program.name, {
          programId: program.id,
          programName: program.name,
        });
        return;
      }

      cancelStopKeepAlive();
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
        synth.setMonitorChannel(useSynthStore.getState().monitorChannel);
      } else {
        synth.start(preset.layers, preset.vibrato);
      }

      synthRef.current = synth;
      customProgramRef.current = program;
      useSynthStore.getState().setIsSynthPlaying(true);
      setIsPlaying(true);
      setElapsed(0);

      // Apply initial volume from store
      const { beatVolume } = useAppStore.getState();
      synth.setMasterVolume(beatVolume);

      const ctx = getAudioContext();
      customStartTimeRef.current = ctx.currentTime;

      // Nature sound
      const { natureSoundId, natureVolume } = useAppStore.getState();
      if (natureSoundId) {
        if (natureSoundId.startsWith("custom-")) {
          playCustomAudio(natureSoundId, natureVolume);
        } else {
          const np = new NaturePlayer();
          np.play(natureSoundId, natureVolume);
          naturePlayerRef.current = np;
        }
      }

      cancelStopKeepAlive();
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
    [cancelStopKeepAlive, stopSession, stopSynth, stopCustomProgram, setIsPlaying, setElapsed, addSessionLog, playCustomAudio, runTimeline]
  );

  const getSynth = useCallback(() => synthRef.current, []);
  const getSession = useCallback(() => sessionRef.current, []);

  // --- Nature sound routing ---
  const playNatureSound = useCallback(
    (soundId: string, volume: number) => {
      const isCustom = soundId.startsWith("custom-");

      // If binaural session is active, delegate built-in sounds to it
      if (sessionRef.current?.isPlaying && !isCustom) {
        sessionRef.current.playNatureSound(soundId, volume);
        return;
      }

      // For custom audio or standalone: use NaturePlayer directly
      stopStandaloneNature();
      if (sessionRef.current?.isPlaying) {
        sessionRef.current.stopNatureSound();
      }

      if (isCustom) {
        playCustomAudio(soundId, volume);
      } else {
        const np = new NaturePlayer();
        np.play(soundId, volume);
        naturePlayerRef.current = np;
      }
    },
    [stopStandaloneNature, playCustomAudio]
  );

  const stopNatureSound = useCallback(() => {
    if (sessionRef.current?.isPlaying) {
      sessionRef.current.stopNatureSound();
      return;
    }
    stopStandaloneNature();
  }, [stopStandaloneNature]);

  const setNatureVolume = useCallback((value: number) => {
    if (naturePlayerRef.current?.isPlaying) {
      naturePlayerRef.current.setVolume(value);
    }
    if (sessionRef.current?.isPlaying) {
      sessionRef.current.setNatureVolume(value);
    }
  }, []);

  const setSynthVolume = useCallback((value: number) => {
    if (timelineRef.current) {
      timelineRef.current.setMasterVolume(value);
    } else {
      synthRef.current?.setMasterVolume(value);
    }
  }, []);

  const setMonitorChannel = useCallback((channel: MonitorChannel) => {
    if (timelineRef.current) {
      timelineRef.current.setMonitorChannel(channel);
    } else {
      synthRef.current?.setMonitorChannel(channel);
    }
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
        startTimelinePreview,
        playNatureSound,
        stopNatureSound,
        setNatureVolume,
        setSynthVolume,
        setMonitorChannel,
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
