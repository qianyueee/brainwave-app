import { ProgramConfig } from "./programs";
import { buildBeatGraph, DEFAULT_BEAT_CHANNEL_MODE, type BeatChannelMode, type BeatGraph } from "./beat-graph";
import { getAudioContext } from "./audio-context";
import { getAudioDestination } from "./keep-alive";
import { getSharedAnalyser } from "./audio-analyser";
import { NaturePlayer, loadAudioBuffer } from "./nature-player";
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

// How far ahead the start fade is scheduled, so it never lands in the past.
const START_LEAD_SEC = 0.05;

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
  private _isPlaying = false;
  private _isPaused = false;
  private startTime = 0;
  private program: ProgramConfig;
  private duration: number;
  private timeScale: number;
  private onEndCallback: (() => void) | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(program: ProgramConfig, duration: number) {
    this.ctx = getAudioContext();
    this.program = program;
    this.duration = duration;
    this.timeScale = duration / program.defaultDuration;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  get elapsed(): number {
    if (!this._isPlaying) return 0;
    return Math.min(this.ctx.currentTime - this.startTime, this.duration);
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

    this.graph = buildBeatGraph(this.ctx, this.program, {
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
      this.musicWaitTimer = setTimeout(() => this.releaseBeat(null), MUSIC_WAIT_MS);
    }

    // Auto-stop at end of duration
    this.endTimer = setTimeout(() => {
      this.stop();
      this.onEndCallback?.();
    }, this.duration * 1000);
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
    const remaining = Math.max(0, this.duration - this.elapsed);
    this.endTimer = setTimeout(() => {
      this.stop();
      this.onEndCallback?.();
    }, remaining * 1000);
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

    // Stop nature sound + music bed
    this.naturePlayer?.stop();
    this.naturePlayer = null;
    this.musicPlayer?.stop();
    this.musicPlayer = null;

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
   */
  async playMusicBed(url: string, volume: number): Promise<void> {
    this.stopMusicBed();
    if (!this._isPlaying) return;
    const player = new NaturePlayer();
    this.musicPlayer = player;
    let buffer: AudioBuffer;
    try {
      buffer = await loadAudioBuffer(this.ctx, url);
    } catch (err) {
      // No music is coming — don't keep the beat waiting for it.
      this.releaseBeat(null);
      throw err;
    }
    // A stop() during the fetch/decode above would have cleared the ref —
    // don't leave an orphan looping after the session ended.
    if (this.musicPlayer !== player || !this._isPlaying) return;
    const at = this.ctx.currentTime + START_LEAD_SEC;
    if (this.waitingForMusic) this.releaseBeat(introOf(buffer), at);
    player.playBuffer(buffer, volume, { at, curve: startFadeCurve(), duration: START_FADE_SEC });
  }

  /** Stop the music bed with fade-out */
  stopMusicBed(): void {
    this.musicPlayer?.stop();
    this.musicPlayer = null;
  }

  /** Adjust music bed volume (0-1) */
  setMusicVolume(value: number): void {
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
