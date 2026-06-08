import { getAudioContext } from "./audio-context";
import { SynthSession } from "./synth-engine";
import type { TimelineSegment, MonitorChannel } from "./synth-engine";

/**
 * TimelineSession — orchestrates a sequence of {@link TimelineSegment}s, each
 * backed by its own {@link SynthSession}, crossfading from one to the next.
 *
 * Why multiple SynthSessions: every SynthSession routes its layers to the shared
 * `getAudioDestination()`, so two can mix simultaneously. At a segment boundary we
 * fade the next one in and the current one out (linear, clock-anchored), then tear
 * the old one down. At most two are live at once — guaranteed by clamping each
 * crossfade to <= min(prevDuration, thisDuration).
 *
 * Boundaries are computed once from the recorded audio start time (`startTime`),
 * so no per-segment timing error accumulates. A late JS tick only shortens that
 * boundary's fade (keeping its end anchored), it never shifts later boundaries.
 */
interface ActiveSegment {
  index: number;
  session: SynthSession;
}

export class TimelineSession {
  private ctx: AudioContext;
  private segments: TimelineSegment[];
  /** Start time (s) of each segment, relative to startTime. */
  private starts: number[] = [];
  private _total = 0;

  private active: ActiveSegment[] = [];
  private startTime = 0;
  private _isPlaying = false;
  private _ended = false;

  private _userVolume = 1;
  private _monitor: MonitorChannel = "both";

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private stopTimers = new Set<ReturnType<typeof setTimeout>>();
  /** How many segments have been started so far (boundary pointer). */
  private startedCount = 0;
  private endCallback: (() => void) | null = null;

  constructor(segments: TimelineSegment[]) {
    this.ctx = getAudioContext();
    this.segments = segments;
    let acc = 0;
    for (const seg of segments) {
      this.starts.push(acc);
      acc += Math.max(1, seg.durationSec);
    }
    this._total = acc;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /** Total timeline length in seconds (sum of segment durations). */
  get total(): number {
    return this._total;
  }

  /** Elapsed seconds since start, clamped to [0, total]. */
  get elapsed(): number {
    if (!this._isPlaying) return 0;
    return Math.min(Math.max(0, this.ctx.currentTime - this.startTime), this._total);
  }

  /** Index of the segment that is currently the primary (latest-started) one. */
  get currentSegmentIndex(): number {
    const e = this.elapsed;
    let idx = 0;
    for (let i = 0; i < this.starts.length; i++) {
      if (e >= this.starts[i]) idx = i;
      else break;
    }
    return idx;
  }

  onEnd(cb: () => void): void {
    this.endCallback = cb;
  }

  start(userVolume = 1, monitor: MonitorChannel = "both"): void {
    if (this._isPlaying || this.segments.length === 0) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    this._userVolume = Math.max(0, Math.min(1, userVolume));
    this._monitor = monitor;
    this.startTime = this.ctx.currentTime;
    this._isPlaying = true;
    this._ended = false;

    // Segment 0 fades in from silence over its own crossfadeSec (intro fade).
    this.startSegment(0, this.startTime);
    this.startedCount = 1;

    this.tickTimer = setInterval(() => this.tick(), 100);
  }

  /** Clamp a segment's crossfade so at most two segments ever overlap. */
  private clampCrossfade(i: number): number {
    const cf = Math.max(0, this.segments[i].crossfadeSec || 0);
    const thisDur = Math.max(1, this.segments[i].durationSec);
    const prevDur = i > 0 ? Math.max(1, this.segments[i - 1].durationSec) : thisDur;
    return Math.min(cf, thisDur, prevDur);
  }

  /** Build + start a segment's SynthSession and fade it in from silence. */
  private startSegment(i: number, idealStart: number): void {
    const seg = this.segments[i];
    const session = new SynthSession();
    const preset = seg.preset;
    const raw = preset.editorMode ?? "free";
    const isStereo = raw.endsWith("-stereo");
    if (isStereo && preset.leftLayers && preset.rightLayers) {
      session.startStereo(preset.leftLayers, preset.rightLayers, preset.vibrato);
      session.setMonitorChannel(this._monitor);
    } else {
      session.start(preset.layers, preset.vibrato);
    }

    const cf = this.clampCrossfade(i);
    // Anchor the fade's end to the ideal boundary: if this tick fired late, the
    // remaining fade shrinks so it still finishes on schedule.
    const lag = Math.max(0, this.ctx.currentTime - idealStart);
    const fadeIn = Math.max(0, cf - lag);
    session.fadeMasterVolume(this._userVolume, fadeIn, true /* fromSilent */);

    this.active.push({ index: i, session });
  }

  /** Fade a live segment out over `fadeSec`, then stop + remove it. */
  private fadeOutAndStop(entry: ActiveSegment, fadeSec: number): void {
    entry.session.fadeMasterVolume(0, fadeSec);
    const t = setTimeout(() => {
      entry.session.stop();
      this.active = this.active.filter((a) => a !== entry);
      this.stopTimers.delete(t);
    }, Math.max(0, fadeSec) * 1000 + 60);
    this.stopTimers.add(t);
  }

  private tick(): void {
    if (!this._isPlaying) return;
    const elapsed = this.ctx.currentTime - this.startTime;

    // Start every segment whose boundary has been reached, crossfading out the
    // previous one. The loop catches up if several boundaries elapsed in one tick.
    while (
      this.startedCount < this.segments.length &&
      elapsed >= this.starts[this.startedCount]
    ) {
      const i = this.startedCount;
      const idealStart = this.startTime + this.starts[i];
      const cf = this.clampCrossfade(i);
      const lag = Math.max(0, this.ctx.currentTime - idealStart);
      const fade = Math.max(0, cf - lag);

      const previous = this.active.filter((a) => a.index === i - 1);
      this.startSegment(i, idealStart);
      for (const prev of previous) {
        this.fadeOutAndStop(prev, fade);
      }
      this.startedCount++;
    }

    if (!this._ended && elapsed >= this._total) {
      this._ended = true;
      this.endCallback?.();
    }
  }

  /** Apply user/master volume (0-1) to every live segment (Mixer control). */
  setMasterVolume(value: number): void {
    this._userVolume = Math.max(0, Math.min(1, value));
    for (const a of this.active) {
      a.session.setMasterVolume(this._userVolume);
    }
  }

  setMonitorChannel(channel: MonitorChannel): void {
    this._monitor = channel;
    for (const a of this.active) {
      a.session.setMonitorChannel(channel);
    }
  }

  stop(): void {
    if (!this._isPlaying && this.active.length === 0) return;
    this._isPlaying = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    for (const t of this.stopTimers) clearTimeout(t);
    this.stopTimers.clear();
    for (const a of this.active) a.session.stop();
    this.active = [];
  }
}
