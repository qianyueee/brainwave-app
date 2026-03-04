import { ProgramConfig } from "./programs";
import { scheduleRamps } from "./ramp-scheduler";
import { getAudioContext } from "./audio-context";
import { getAudioDestination } from "./keep-alive";
import { NaturePlayer } from "./nature-player";

// Re-export so existing imports from "@/lib/audio-engine" keep working
export { getAudioContext } from "./audio-context";
export { NATURE_SOUNDS } from "./nature-player";
export type { NatureSoundConfig } from "./nature-player";

export interface SessionState {
  isPlaying: boolean;
  elapsed: number;
  totalDuration: number;
}

// Harmonic overtone config: [multiplier, gain]
// Fundamental(1x) 0.82 + 2nd harmonic 0.12 + 3rd harmonic 0.06 = 1.0
const HARMONICS: readonly [number, number][] = [
  [1, 0.82],   // fundamental
  [2, 0.12],   // 2nd harmonic — adds warmth
  [3, 0.06],   // 3rd harmonic — subtle brightness
];

export class BinauralSession {
  private ctx: AudioContext;
  private leftOsc: OscillatorNode | null = null;
  private rightOsc: OscillatorNode | null = null;
  private leftGain: GainNode | null = null;
  private rightGain: GainNode | null = null;
  private leftHarmonicOscs: OscillatorNode[] = [];
  private leftHarmonicGains: GainNode[] = [];
  private rightHarmonicOscs: OscillatorNode[] = [];
  private rightHarmonicGains: GainNode[] = [];
  private merger: ChannelMergerNode | null = null;
  // Nature sound
  private naturePlayer: NaturePlayer | null = null;
  private _isPlaying = false;
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

  start(initialVolume = 1): void {
    if (this._isPlaying) return;

    // Ensure context is running
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    const carrier = this.program.carrierFreq;
    const initBeat = this.program.phases[0].startBeatFreq;
    const vol = Math.max(0, Math.min(1, initialVolume));

    // Create channel-level gain nodes with fade-in to target volume
    this.leftGain = this.ctx.createGain();
    this.rightGain = this.ctx.createGain();
    this.leftGain.gain.setValueAtTime(0, now);
    this.rightGain.gain.setValueAtTime(0, now);
    this.leftGain.gain.linearRampToValueAtTime(vol, now + 0.05);
    this.rightGain.gain.linearRampToValueAtTime(vol, now + 0.05);

    // ChannelMergerNode: input 0 = left channel, input 1 = right channel
    this.merger = this.ctx.createChannelMerger(2);
    this.merger.connect(getAudioDestination());

    // Create fundamental + harmonic oscillators for each channel
    // Harmonics are at fixed carrier multiples (no beat offset) to keep binaural beat clean
    this.leftHarmonicOscs = [];
    this.leftHarmonicGains = [];
    this.rightHarmonicOscs = [];
    this.rightHarmonicGains = [];

    for (const [mult, gain] of HARMONICS) {
      // Left channel: harmonics at carrier * mult
      const lOsc = this.ctx.createOscillator();
      lOsc.type = "sine";
      lOsc.frequency.setValueAtTime(carrier * mult, now);
      const lGain = this.ctx.createGain();
      lGain.gain.setValueAtTime(gain, now);
      lOsc.connect(lGain);
      lGain.connect(this.leftGain);
      this.leftHarmonicOscs.push(lOsc);
      this.leftHarmonicGains.push(lGain);

      // Right channel: fundamental gets beat offset, harmonics are fixed
      const rOsc = this.ctx.createOscillator();
      rOsc.type = "sine";
      if (mult === 1) {
        // Fundamental: carrier + beat frequency (ramped)
        rOsc.frequency.setValueAtTime(carrier + initBeat, now);
      } else {
        // Harmonics: fixed at carrier * mult (no beat)
        rOsc.frequency.setValueAtTime(carrier * mult, now);
      }
      const rGain = this.ctx.createGain();
      rGain.gain.setValueAtTime(gain, now);
      rOsc.connect(rGain);
      rGain.connect(this.rightGain);
      this.rightHarmonicOscs.push(rOsc);
      this.rightHarmonicGains.push(rGain);
    }

    // Keep references to fundamentals for external access
    this.leftOsc = this.leftHarmonicOscs[0];
    this.rightOsc = this.rightHarmonicOscs[0];

    // Connect channel gains to merger
    this.leftGain.connect(this.merger, 0, 0);
    this.rightGain.connect(this.merger, 0, 1);

    // Schedule frequency ramps on right fundamental oscillator only
    scheduleRamps(this.rightOsc, carrier, this.program.phases, this.timeScale, now);

    // Start all oscillators
    for (const osc of this.leftHarmonicOscs) osc.start(now);
    for (const osc of this.rightHarmonicOscs) osc.start(now);

    this.startTime = now;
    this._isPlaying = true;

    // Auto-stop at end of duration
    this.endTimer = setTimeout(() => {
      this.stop();
      this.onEndCallback?.();
    }, this.duration * 1000);
  }

  stop(): void {
    if (!this._isPlaying) return;

    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }

    const now = this.ctx.currentTime;
    const fadeOut = 0.2;

    // Fade out binaural
    if (this.leftGain) {
      this.leftGain.gain.cancelScheduledValues(now);
      this.leftGain.gain.setValueAtTime(this.leftGain.gain.value, now);
      this.leftGain.gain.linearRampToValueAtTime(0, now + fadeOut);
    }
    if (this.rightGain) {
      this.rightGain.gain.cancelScheduledValues(now);
      this.rightGain.gain.setValueAtTime(this.rightGain.gain.value, now);
      this.rightGain.gain.linearRampToValueAtTime(0, now + fadeOut);
    }

    // Stop nature sound
    this.naturePlayer?.stop();
    this.naturePlayer = null;

    // Stop and disconnect after fade-out
    setTimeout(() => {
      for (const osc of this.leftHarmonicOscs) { osc.stop(); osc.disconnect(); }
      for (const osc of this.rightHarmonicOscs) { osc.stop(); osc.disconnect(); }
      for (const g of this.leftHarmonicGains) g.disconnect();
      for (const g of this.rightHarmonicGains) g.disconnect();
      this.leftGain?.disconnect();
      this.rightGain?.disconnect();
      this.merger?.disconnect();

      this.leftOsc = null;
      this.rightOsc = null;
      this.leftHarmonicOscs = [];
      this.rightHarmonicOscs = [];
      this.leftHarmonicGains = [];
      this.rightHarmonicGains = [];
      this.leftGain = null;
      this.rightGain = null;
      this.merger = null;
    }, fadeOut * 1000 + 50);

    this._isPlaying = false;
  }

  setVolume(value: number): void {
    const v = Math.max(0, Math.min(1, value));
    const now = this.ctx.currentTime;
    if (this.leftGain) {
      this.leftGain.gain.cancelScheduledValues(now);
      this.leftGain.gain.setValueAtTime(this.leftGain.gain.value, now);
      this.leftGain.gain.setTargetAtTime(v, now, 0.02);
    }
    if (this.rightGain) {
      this.rightGain.gain.cancelScheduledValues(now);
      this.rightGain.gain.setValueAtTime(this.rightGain.gain.value, now);
      this.rightGain.gain.setTargetAtTime(v, now, 0.02);
    }
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

  getState(): SessionState {
    return {
      isPlaying: this._isPlaying,
      elapsed: this.elapsed,
      totalDuration: this.duration,
    };
  }
}
