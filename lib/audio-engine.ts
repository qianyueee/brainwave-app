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

export class BinauralSession {
  private ctx: AudioContext;
  private leftOsc: OscillatorNode | null = null;
  private rightOsc: OscillatorNode | null = null;
  private leftGain: GainNode | null = null;
  private rightGain: GainNode | null = null;
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

  start(): void {
    if (this._isPlaying) return;

    // Ensure context is running
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;

    // Create oscillators (mono output each)
    this.leftOsc = this.ctx.createOscillator();
    this.rightOsc = this.ctx.createOscillator();
    this.leftOsc.type = "sine";
    this.rightOsc.type = "sine";

    // Left = carrier freq (constant)
    this.leftOsc.frequency.setValueAtTime(this.program.carrierFreq, now);
    // Right = carrier + initial beat freq (will be ramped)
    this.rightOsc.frequency.setValueAtTime(
      this.program.carrierFreq + this.program.phases[0].startBeatFreq,
      now
    );

    // Create gain nodes with fade-in
    this.leftGain = this.ctx.createGain();
    this.rightGain = this.ctx.createGain();
    this.leftGain.gain.setValueAtTime(0, now);
    this.rightGain.gain.setValueAtTime(0, now);
    this.leftGain.gain.linearRampToValueAtTime(0.5, now + 0.05); // 50ms fade-in
    this.rightGain.gain.linearRampToValueAtTime(0.5, now + 0.05);

    // ChannelMergerNode: input 0 = left channel, input 1 = right channel
    this.merger = this.ctx.createChannelMerger(2);

    // Signal chain: Osc → Gain → Merger(channel) → destination
    this.leftOsc.connect(this.leftGain);
    this.leftGain.connect(this.merger, 0, 0);

    this.rightOsc.connect(this.rightGain);
    this.rightGain.connect(this.merger, 0, 1);

    this.merger.connect(getAudioDestination());

    // Schedule frequency ramps on right oscillator
    scheduleRamps(this.rightOsc, this.program.carrierFreq, this.program.phases, this.timeScale, now);

    // Start oscillators
    this.leftOsc.start(now);
    this.rightOsc.start(now);

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
      this.leftOsc?.stop();
      this.rightOsc?.stop();
      this.leftOsc?.disconnect();
      this.rightOsc?.disconnect();
      this.leftGain?.disconnect();
      this.rightGain?.disconnect();
      this.merger?.disconnect();

      this.leftOsc = null;
      this.rightOsc = null;
      this.leftGain = null;
      this.rightGain = null;
      this.merger = null;
    }, fadeOut * 1000 + 50);

    this._isPlaying = false;
  }

  setVolume(value: number): void {
    const v = Math.max(0, Math.min(1, value)) * 0.5;
    const now = this.ctx.currentTime;
    this.leftGain?.gain.setTargetAtTime(v, now, 0.02);
    this.rightGain?.gain.setTargetAtTime(v, now, 0.02);
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
