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
import { zodiacMusicUrl } from "@/lib/zodiac-audio";
import { getAudioBlob } from "@/lib/custom-audio-db";
import { ensureBlobCached } from "@/lib/sync/custom-audios";
import { startKeepAlive, stopKeepAlive, setMediaSessionHandlers, setMediaSessionPlaybackState, setKeepAliveOutputPaused } from "@/lib/keep-alive";
import { setUserPaused } from "@/lib/audio-context";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { useCustomAudioStore } from "@/store/useCustomAudioStore";

interface AudioContextValue {
  startSession: (program: ProgramConfig, duration: number) => void;
  stopSession: (opts?: { log?: boolean }) => void;
  /** 一時停止（ctx.suspend）— バイノーラル/カスタム/タイムライン再生が対象 */
  pauseSession: () => void;
  resumeSession: () => void;
  getSession: () => BinauralSession | null;
  startSynth: (layers: SynthLayer[]) => void;
  stopSynth: () => void;
  getSynth: () => SynthSession | null;
  updateSynthLayer: (id: string, patch: Partial<Pick<SynthLayer, "frequency" | "volume" | "tone">>) => void;
  updateSynthLayerTremolo: (id: string, tremolo: TremoloConfig) => void;
  updateSynthVibrato: (vibrato: VibratoConfig) => void;
  // Custom program playback
  startCustomProgram: (program: CustomProgram, duration: number) => void;
  stopCustomProgram: (opts?: { log?: boolean }) => void;
  // Timeline preview (synth editor): play an in-progress segment sequence
  startTimelinePreview: (segments: TimelineSegment[]) => void;
  // Nature sound routing (works with any active engine)
  playNatureSound: (soundId: string, volume: number) => void;
  stopNatureSound: () => void;
  setNatureVolume: (value: number) => void;
  // Zodiac music bed volume (for Mixer)
  setMusicVolume: (value: number) => void;
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
  // Custom-program duration only lived in the startCustomProgram closure before;
  // pause/resume needs it to re-arm the wall-clock end timer.
  const customDurationRef = useRef<number>(0);
  const customRemainingRef = useRef<number>(0);
  const customProgramRef = useRef<CustomProgram | null>(null);
  const timelineRef = useRef<TimelineSession | null>(null);
  const timelineLogInfoRef = useRef<{ programId: string; programName: string } | null>(null);

  const setIsPlaying = useAppStore((s) => s.setIsPlaying);
  const setIsPaused = useAppStore((s) => s.setIsPaused);
  const setPlayingProgramId = useAppStore((s) => s.setPlayingProgramId);
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

  const logPlayed = useCallback(
    (programId: string, programName: string, seconds: number) => {
      if (seconds < 1) return;
      addSessionLog({
        id: Date.now().toString(),
        programId,
        programName,
        date: new Date().toISOString(),
        duration: Math.round(seconds),
        mood: useAppStore.getState().mood,
      });
    },
    [addSessionLog]
  );

  const clearPauseIntent = useCallback(() => {
    setUserPaused(false);
    setIsPaused(false);
  }, [setIsPaused]);

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

  const stopCustomProgram = useCallback((opts?: { log?: boolean }) => {
    // Un-suspend first so scheduled fades/stops below actually run.
    clearPauseIntent();
    if (timelineRef.current || synthRef.current) getAudioContext();

    if (opts?.log) {
      if (timelineRef.current?.isPlaying && timelineLogInfoRef.current) {
        logPlayed(
          timelineLogInfoRef.current.programId,
          timelineLogInfoRef.current.programName,
          timelineRef.current.elapsed
        );
      } else if (customProgramRef.current && synthRef.current?.isPlaying) {
        const played = Math.min(
          getAudioContext().currentTime - customStartTimeRef.current,
          customDurationRef.current
        );
        logPlayed(customProgramRef.current.id, customProgramRef.current.name, played);
      }
    }

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
    customDurationRef.current = 0;
    customRemainingRef.current = 0;
    timelineLogInfoRef.current = null;
    setIsPlaying(false);
    setPlayingProgramId(null);
    setElapsed(0);
    useSynthStore.getState().setIsSynthPlaying(false);
    if (!sessionRef.current?.isPlaying) {
      scheduleStopKeepAlive();
    }
  }, [stopPolling, stopStandaloneNature, setIsPlaying, setPlayingProgramId, setElapsed, scheduleStopKeepAlive, clearPauseIntent, logPlayed]);

  const stopSession = useCallback((opts?: { log?: boolean }) => {
    const session = sessionRef.current;
    // Manual stop logs the partial session; natural end logs in onEnd before
    // calling here without opts (single log per session either way).
    if (opts?.log && session?.isPlaying) {
      const program = session.getProgram();
      logPlayed(program.id, program.name, session.elapsed);
    }
    clearPauseIntent();
    session?.stop(); // handles its own un-suspend when paused
    sessionRef.current = null;
    stopPolling();
    setIsPlaying(false);
    setPlayingProgramId(null);
    setElapsed(0);
    if (!synthRef.current?.isPlaying && !customProgramRef.current) {
      scheduleStopKeepAlive();
    }
  }, [stopPolling, setIsPlaying, setPlayingProgramId, setElapsed, scheduleStopKeepAlive, clearPauseIntent, logPlayed]);

  // Arm/re-arm the custom-program auto-stop timer (initial start and resume).
  const armCustomEndTimer = useCallback(
    (remainingSec: number) => {
      if (customEndTimerRef.current) clearTimeout(customEndTimerRef.current);
      customEndTimerRef.current = setTimeout(() => {
        const p = customProgramRef.current;
        if (p) logPlayed(p.id, p.name, customDurationRef.current);
        stopCustomProgram();
      }, remainingSec * 1000);
    },
    [logPlayed, stopCustomProgram]
  );

  // Pause = ctx.suspend(): the audio clock freezes (elapsed, freq ramps, nature,
  // music bed), so no wall-clock bookkeeping is needed beyond the end timers,
  // which do NOT freeze and must be cleared here / re-armed on resume.
  const pauseSession = useCallback(() => {
    const binaural = sessionRef.current;
    if (binaural?.isPlaying && !binaural.isPaused) {
      binaural.pause();
    } else if (timelineRef.current?.isPlaying) {
      // Timeline end detection compares the frozen ctx clock — suspend suffices.
      getAudioContext().suspend();
    } else if (customProgramRef.current && synthRef.current?.isPlaying) {
      const ctx = getAudioContext();
      customRemainingRef.current = Math.max(
        0,
        customDurationRef.current - (ctx.currentTime - customStartTimeRef.current)
      );
      if (customEndTimerRef.current) {
        clearTimeout(customEndTimerRef.current);
        customEndTimerRef.current = null;
      }
      ctx.suspend();
    } else {
      return;
    }
    setUserPaused(true);
    // The suspended context stops feeding the keep-alive MediaStream; a
    // still-playing <audio> then stutters on some mobile browsers — pause it.
    setKeepAliveOutputPaused(true);
    setIsPaused(true);
    setMediaSessionPlaybackState("paused");
  }, [setIsPaused]);

  const resumeSession = useCallback(() => {
    // Clear the intent BEFORE touching the context so getAudioContext() may resume.
    setUserPaused(false);
    const binaural = sessionRef.current;
    if (binaural?.isPaused) {
      binaural.resume();
    } else if (timelineRef.current?.isPlaying) {
      getAudioContext();
    } else if (customProgramRef.current && synthRef.current?.isPlaying) {
      getAudioContext();
      armCustomEndTimer(customRemainingRef.current);
    } else {
      setIsPaused(false);
      return;
    }
    setKeepAliveOutputPaused(false);
    setIsPaused(false);
    setMediaSessionPlaybackState("playing");
  }, [setIsPaused, armCustomEndTimer]);

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
      clearPauseIntent();
      getAudioContext();
      stopSynth();
      stopCustomProgram();

      // Direct engine stop (not stopSession): switching programs mid-session
      // deliberately does not log the interrupted session.
      if (sessionRef.current?.isPlaying) {
        sessionRef.current.stop();
      }
      stopPolling();

      const session = new BinauralSession(program, duration);
      const { beatVolume } = useAppStore.getState();
      session.onEnd(() => {
        logPlayed(program.id, program.name, duration);
        stopSession();
      });

      session.start(beatVolume);
      sessionRef.current = session;
      setIsPlaying(true);
      setPlayingProgramId(program.id);
      setElapsed(0);

      cancelStopKeepAlive();
      startKeepAlive(program.name);
      setMediaSessionPlaybackState("playing");
      setMediaSessionHandlers(resumeSession, pauseSession);

      const { natureSoundId, natureVolume, musicVolume } = useAppStore.getState();
      if (natureSoundId) {
        if (natureSoundId.startsWith("custom-")) {
          playCustomAudio(natureSoundId, natureVolume);
        } else {
          session.playNatureSound(natureSoundId, natureVolume);
        }
      }

      // Zodiac programs carry a music bed; the beat above it is still the
      // synthesised one, since the tracks hold no entrainment themselves.
      const musicUrl = zodiacMusicUrl(program.id);
      if (musicUrl) {
        session.playMusicBed(musicUrl, musicVolume).catch((err) => {
          console.error("[audio-provider] zodiac music bed failed:", err);
        });
      }

      pollRef.current = setInterval(() => {
        if (sessionRef.current?.isPlaying) {
          setElapsed(sessionRef.current.elapsed);
        }
      }, 1000);
    },
    [cancelStopKeepAlive, clearPauseIntent, stopPolling, stopSession, stopSynth, stopCustomProgram, setIsPlaying, setPlayingProgramId, setElapsed, logPlayed, playCustomAudio, pauseSession, resumeSession]
  );

  const startSynth = useCallback(
    (layers: SynthLayer[]) => {
      cancelStopKeepAlive();
      clearPauseIntent();
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
      setMediaSessionPlaybackState("playing");
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
    [cancelStopKeepAlive, clearPauseIntent, stopSession, stopSynth, stopCustomProgram]
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
      clearPauseIntent();
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
      timelineLogInfoRef.current = logInfo;
      useSynthStore.getState().setIsSynthPlaying(true);
      setIsPlaying(true);
      setPlayingProgramId(logInfo?.programId ?? null);
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
      setMediaSessionPlaybackState("playing");
      setMediaSessionHandlers(resumeSession, pauseSession);

      pollRef.current = setInterval(() => {
        if (timelineRef.current?.isPlaying) {
          setElapsed(timelineRef.current.elapsed);
        }
      }, 1000);

      ts.onEnd(() => {
        if (logInfo) {
          logPlayed(logInfo.programId, logInfo.programName, ts.total);
        }
        stopCustomProgram();
      });
    },
    [cancelStopKeepAlive, clearPauseIntent, stopSession, stopSynth, stopCustomProgram, setIsPlaying, setPlayingProgramId, setElapsed, logPlayed, playCustomAudio, pauseSession, resumeSession]
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
      clearPauseIntent();
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
      setPlayingProgramId(program.id);
      setElapsed(0);

      // Apply initial volume from store
      const { beatVolume } = useAppStore.getState();
      synth.setMasterVolume(beatVolume);

      const ctx = getAudioContext();
      customStartTimeRef.current = ctx.currentTime;
      customDurationRef.current = duration;

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
      setMediaSessionPlaybackState("playing");
      setMediaSessionHandlers(resumeSession, pauseSession);

      // Elapsed polling — reads the raw ctx ref, not getAudioContext(), so a
      // user-paused (suspended) context is left untouched by the interval.
      pollRef.current = setInterval(() => {
        if (customProgramRef.current && synthRef.current?.isPlaying) {
          const el = Math.min(ctx.currentTime - customStartTimeRef.current, duration);
          setElapsed(el);
        }
      }, 1000);

      // Auto-stop timer
      armCustomEndTimer(duration);
    },
    [cancelStopKeepAlive, clearPauseIntent, stopSession, stopSynth, stopCustomProgram, setIsPlaying, setPlayingProgramId, setElapsed, playCustomAudio, runTimeline, armCustomEndTimer, pauseSession, resumeSession]
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

  const setMusicVolume = useCallback((value: number) => {
    sessionRef.current?.setMusicVolume(value);
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
        pauseSession,
        resumeSession,
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
        setMusicVolume,
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
