import { ProgramConfig } from "./programs";
import { isUnlimitedDuration, sessionTimeline } from "./session-length";
import { buildBeatGraph, DEFAULT_BEAT_CHANNEL_MODE, type BeatChannelMode, type BeatGraph } from "./beat-graph";
import { getAudioContext } from "./audio-context";
import { getAudioDestination } from "./keep-alive";
import { getSharedAnalyser } from "./audio-analyser";
import { AudioLoadError, NaturePlayer, loadAudioBuffer } from "./nature-player";
import {
  MUSIC_WAIT_MS,
  START_FADE_SEC,
  beatStartCurve,
  curveDuration,
  measureIntro,
  startFadeCurve,
} from "./music-intro";

// Re-export so existing imports from "@/lib/audio-engine" keep working
export { getAudioContext } from "./audio-context";
export { NATURE_SOUNDS } from "./nature-player";
export type { NatureSoundConfig } from "./nature-player";

export interface SessionState {
  isPlaying: boolean;
  elapsed: number;
  totalDuration: number;
}

/**
 * Where the music bed of a playing session stands (the Mixer shows it while
 * the music is missing):
 * - loading: first load under way, the beat still waits for it (≤ MUSIC_WAIT_MS)
 * - late: still loading, the beat has started without it
 * - retrying: a load failed; tried again until it works or the session ends
 * - failed: the track itself could not be loaded (missing, undecodable)
 * - playing: the music is on
 */
export type MusicBedStatus = "loading" | "late" | "retrying" | "failed" | "playing";

// How far ahead the start fade is scheduled, so it never lands in the past.
const START_LEAD_SEC = 0.05;

// Waits between music bed loads that failed. A dropped connection or a
// stalled download is tried again for as long as the session plays (a session
// runs 5–30 minutes or without end, and a hiccup in its first seconds used to
// leave all of it beat-only). A failed try costs next to nothing, so the waits
// stay short enough that the music follows soon after the connection does.
const MUSIC_RETRY_MS = [2_000, 4_000, 8_000, 15_000, 30_000];
// A track that isn't there (404) or won't decode is not a passing fault: a
// couple of tries, then the session goes on with the beat alone.
const MUSIC_TRIES_IF_NOT_TRANSIENT = 3;

/** How long to wait before load attempt `failed + 1`; null = give up. */
function musicRetryDelay(err: unknown, failed: number): number | null {
  const transient = err instanceof AudioLoadError && err.transient;
  if (!transient && failed >= MUSIC_TRIES_IF_NOT_TRANSIENT) return null;
  return MUSIC_RETRY_MS[Math.min(failed, MUSIC_RETRY_MS.length) - 1];
}

/** Resolves after `ms`, or as soon as the device is back online, or on abort. */
function waitToRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    window.addEventListener("online", done);
    signal.addEventListener("abort", done);
  });
}

// Each track's measured opening swell. bufferCache hands back the same
// AudioBuffer for a replay, so a track is measured once while it is cached.
const introCache = new WeakMap<AudioBuffer, Float32Array | null>();

function introOf(buffer: AudioBuffer): Float32Array | null {
  if (introCache.has(buffer)) return introCache.get(buffer) ?? null;
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const intro = measureIntro(channels, buffer.sampleRate);
  introCache.set(buffer, intro);
  return intro;
}

export class BinauralSession {
  private ctx: AudioContext;
  // The beat itself — oscillators, the stereo/mono routing (lib/beat-graph.ts).
  private graph: BeatGraph | null = null;
  // Beat volume (the Mixer slider), after the graph's stereo output.
  private volumeGain: GainNode | null = null;
  // Start fade, after the merger and apart from the volume gains above. A
  // program with a music bed holds it at 0 — the beat runs silent — until the
  // track begins, then raises it along the track's own audible swell
  // (lib/music-intro.ts), so beat and music grow louder together. Being its
  // own stage, the volume slider can move mid-fade without breaking the curve.
  private fadeGain: GainNode | null = null;
  private waitingForMusic = false;
  private musicWaitTimer: ReturnType<typeof setTimeout> | null = null;
  // Nature sound
  private naturePlayer: NaturePlayer | null = null;
  // Zodiac music bed — a separate looped layer, independent of the nature sound
  // so a user can run both (music under the beat, rain on top) at once.
  private musicPlayer: NaturePlayer | null = null;
  // Ends the music bed's loading (and its retries) when the session stops.
  private musicAbort: AbortController | null = null;
  // The music slider's value — moving it while the track loads must count.
  private musicVolume = 1;
  private musicStatus: MusicBedStatus | null = null;
  private onMusicStatusCallback: ((status: MusicBedStatus) => void) | null = null;
  private _isPlaying = false;
  private _isPaused = false;
  private startTime = 0;
  private program: ProgramConfig;
  // The phases actually played — the program's own, minus its ending when the
  // session is unlimited (lib/session-length.ts).
  private phases: ProgramConfig["phases"];
  // Seconds; UNLIMITED_DURATION (0) = plays until stopped — no end timer.
  private duration: number;
  private unlimited: boolean;
  private timeScale: number;
  private onEndCallback: (() => void) | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(program: ProgramConfig, duration: number) {
    this.ctx = getAudioContext();
    this.program = program;
    this.duration = duration;
    this.unlimited = isUnlimitedDuration(duration);
    const timeline = sessionTimeline(program, duration);
    this.phases = timeline.phases;
    this.timeScale = timeline.timeScale;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  get elapsed(): number {
    if (!this._isPlaying) return 0;
    const played = this.ctx.currentTime - this.startTime;
    return this.unlimited ? played : Math.min(played, this.duration);
  }

  get totalDuration(): number {
    return this.duration;
  }

  getProgram(): ProgramConfig {
    return this.program;
  }

  getTimeScale(): number {
    return this.timeScale;
  }

  onEnd(callback: () => void): void {
    this.onEndCallback = callback;
  }

  /** Follow the music bed's status (see MusicBedStatus). */
  onMusicStatus(callback: (status: MusicBedStatus) => void): void {
    this.onMusicStatusCallback = callback;
  }

  private setMusicStatus(status: MusicBedStatus): void {
    if (this.musicStatus === status) return;
    this.musicStatus = status;
    this.onMusicStatusCallback?.(status);
  }

  /**
   * `waitForMusic`: the program has a music bed — keep the beat silent until
   * playMusicBed starts the track (or MUSIC_WAIT_MS passes), then fade it in
   * with the music. Without it the beat starts at once, as it always has.
   * `mode`: stereo (binaural) or mono (monaural) — see lib/beat-graph.ts.
   */
  start(
    initialVolume = 1,
    opts: { waitForMusic?: boolean; mode?: BeatChannelMode } = {}
  ): void {
    if (this._isPlaying) return;

    // Ensure context is running
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    const vol = Math.max(0, Math.min(1, initialVolume));

    // graph (stereo out) → volume (50ms fade-in to the slider value) → start
    // fade → analyser/destination
    this.volumeGain = this.ctx.createGain();
    this.volumeGain.gain.setValueAtTime(0, now);
    this.volumeGain.gain.linearRampToValueAtTime(vol, now + 0.05);
    this.fadeGain = this.ctx.createGain();
    this.fadeGain.gain.setValueAtTime(opts.waitForMusic ? 0 : 1, now);
    this.volumeGain.connect(this.fadeGain);
    this.fadeGain.connect(getSharedAnalyser() ?? getAudioDestination());

    this.graph = buildBeatGraph(this.ctx, { ...this.program, phases: this.phases }, {
      timeScale: this.timeScale,
      startAt: now,
      mode: opts.mode ?? DEFAULT_BEAT_CHANNEL_MODE,
    });
    this.graph.output.connect(this.volumeGain);

    this.startTime = now;
    this._isPlaying = true;

    if (opts.waitForMusic) {
      this.waitingForMusic = true;
      // The track is late (slow network): raise the beat alone; the music
      // still fades in with the same curve when it arrives.
      this.musicWaitTimer = setTimeout(() => {
        this.releaseBeat(null);
        if (this.musicStatus === "loading") this.setMusicStatus("late");
      }, MUSIC_WAIT_MS);
    }

    // Auto-stop at end of duration (an unlimited session runs until stopped).
    this.armEndTimer(this.duration);
  }

  private armEndTimer(remainingSec: number): void {
    if (this.unlimited) return;
    this.endTimer = setTimeout(() => {
      this.stop();
      this.onEndCallback?.();
    }, remainingSec * 1000);
  }

  /**
   * Pause via ctx.suspend(): currentTime freezes, so elapsed, the scheduled
   * frequency ramps, nature loop and music bed all freeze in place without
   * touching the oscillators (they cannot restart once stopped). The wall-clock
   * end timer does NOT freeze — clear it here, re-arm on resume.
   */
  pause(): void {
    if (!this._isPlaying || this._isPaused) return;
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    this._isPaused = true;
    this.ctx.suspend();
  }

  resume(): void {
    if (!this._isPlaying || !this._isPaused) return;
    this._isPaused = false;
    this.ctx.resume();
    this.armEndTimer(Math.max(0, this.duration - this.elapsed));
  }

  stop(): void {
    if (!this._isPlaying) return;

    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    if (this.musicWaitTimer) {
      clearTimeout(this.musicWaitTimer);
      this.musicWaitTimer = null;
    }
    this.waitingForMusic = false;

    // A suspended context would freeze the fade-out below — un-suspend first.
    // Raw resume (not getAudioContext) on purpose; the caller resets the
    // user-pause intent, and a new start clears it anyway.
    if (this._isPaused) {
      this._isPaused = false;
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    const fadeOut = 0.2;

    // Fade out the beat
    if (this.volumeGain) {
      this.volumeGain.gain.cancelScheduledValues(now);
      this.volumeGain.gain.setValueAtTime(this.volumeGain.gain.value, now);
      this.volumeGain.gain.linearRampToValueAtTime(0, now + fadeOut);
    }

    // Stop nature sound + music bed (and any load of it still going)
    this.naturePlayer?.stop();
    this.naturePlayer = null;
    this.stopMusicBed();

    // Stop and disconnect after fade-out
    const graph = this.graph;
    const volumeGain = this.volumeGain;
    const fadeGain = this.fadeGain;
    this.graph = null;
    this.volumeGain = null;
    this.fadeGain = null;
    setTimeout(() => {
      graph?.dispose();
      volumeGain?.disconnect();
      fadeGain?.disconnect();
    }, fadeOut * 1000 + 50);

    this._isPlaying = false;
  }

  setVolume(value: number): void {
    const v = Math.max(0, Math.min(1, value));
    const now = this.ctx.currentTime;
    if (this.volumeGain) {
      this.volumeGain.gain.cancelScheduledValues(now);
      this.volumeGain.gain.setValueAtTime(this.volumeGain.gain.value, now);
      this.volumeGain.gain.setTargetAtTime(v, now, 0.02);
    }
  }

  /** Switch stereo (binaural) ⇄ mono (monaural) while playing — no restart. */
  setChannelMode(mode: BeatChannelMode): void {
    this.graph?.setMode(mode);
  }

  /** Load and play a nature sound, looping until session stops */
  async playNatureSound(soundId: string, volume: number): Promise<void> {
    this.stopNatureSound();
    if (!this._isPlaying) return;
    this.naturePlayer = new NaturePlayer();
    await this.naturePlayer.play(soundId, volume);
  }

  /** Stop nature sound with fade-out */
  stopNatureSound(): void {
    this.naturePlayer?.stop();
    this.naturePlayer = null;
  }

  /** Adjust nature sound volume (0-1) */
  setNatureVolume(value: number): void {
    this.naturePlayer?.setVolume(value);
  }

  /**
   * Raise the beat held silent by `waitForMusic`: along the track's opening
   * swell (`intro`; null = the plain start fade) from `at` (default: now).
   */
  private releaseBeat(intro: Float32Array | null, at?: number): void {
    if (this.musicWaitTimer) {
      clearTimeout(this.musicWaitTimer);
      this.musicWaitTimer = null;
    }
    if (!this.waitingForMusic || !this.fadeGain || !this._isPlaying) return;
    this.waitingForMusic = false;
    const curve = beatStartCurve(intro);
    this.fadeGain.gain.setValueCurveAtTime(
      curve,
      at ?? this.ctx.currentTime + START_LEAD_SEC,
      curveDuration(curve)
    );
  }

  /**
   * Load and loop the music bed under the beat. The delivered tracks run 1-8
   * minutes against a 15-minute session, so they loop; they carry no
   * entrainment of their own, which is why the oscillators keep running.
   *
   * The track starts with a START_FADE_SEC fade, and a beat still waiting for
   * it (start's `waitForMusic`) starts at the same instant, following what the
   * listener hears: the track's own recorded swell times that fade.
   *
   * A load that fails (no connection, a stalled download, a server error) is
   * tried again while the session plays; the beat doesn't wait for the retries,
   * and the music fades in whenever it arrives. Rejects only when the track
   * itself can't be had (see musicRetryDelay).
   */
  async playMusicBed(url: string, volume: number): Promise<void> {
    this.stopMusicBed();
    if (!this._isPlaying) return;
    this.musicVolume = volume;
    const player = new NaturePlayer();
    this.musicPlayer = player;
    const abort = new AbortController();
    this.musicAbort = abort;
    // A stop() (or a newer playMusicBed) while loading ends this one — don't
    // leave an orphan looping after the session ended.
    const current = () => !abort.signal.aborted && this.musicPlayer === player && this._isPlaying;
    this.setMusicStatus(this.waitingForMusic ? "loading" : "late");

    let buffer: AudioBuffer | null = null;
    for (let failed = 0; !buffer; ) {
      try {
        buffer = await loadAudioBuffer(this.ctx, url, abort.signal);
      } catch (err) {
        if (!current()) return;
        failed++;
        // No music yet — don't keep the beat waiting for it.
        this.releaseBeat(null);
        const delay = musicRetryDelay(err, failed);
        if (delay === null) {
          this.setMusicStatus("failed");
          throw err;
        }
        this.setMusicStatus("retrying");
        console.warn(`[audio-engine] music bed load failed (try ${failed}), retrying:`, err);
        await waitToRetry(delay, abort.signal);
        if (!current()) return;
      }
    }
    if (!current()) return;
    // Everything slow comes before reading the clock: measuring the intro can
    // take tens of milliseconds on a phone, and the start time must still be
    // ahead of the clock when it is scheduled.
    const intro = this.waitingForMusic ? introOf(buffer) : null;
    const fade = startFadeCurve();
    const at = this.ctx.currentTime + START_LEAD_SEC;
    if (this.waitingForMusic) this.releaseBeat(intro, at);
    player.playBuffer(buffer, this.musicVolume, { at, curve: fade, duration: START_FADE_SEC });
    this.setMusicStatus("playing");
  }

  /** Stop the music bed with fade-out (and stop loading it) */
  stopMusicBed(): void {
    this.musicAbort?.abort();
    this.musicAbort = null;
    this.musicPlayer?.stop();
    this.musicPlayer = null;
  }

  /** Adjust music bed volume (0-1) */
  setMusicVolume(value: number): void {
    this.musicVolume = value;
    this.musicPlayer?.setVolume(value);
  }

  getState(): SessionState {
    return {
      isPlaying: this._isPlaying,
      elapsed: this.elapsed,
      totalDuration: this.duration,
    };
  }
}
