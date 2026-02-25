import { getAudioContext } from "./audio-context";
import { getAudioDestination } from "./keep-alive";

export interface NatureSoundConfig {
  id: string;
  name: string;
  file: string;
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const NATURE_SOUNDS: NatureSoundConfig[] = [
  { id: "rain", name: "雨", file: `${BASE_PATH}/sounds/rain.mp3` },
  { id: "ocean", name: "海", file: `${BASE_PATH}/sounds/ocean.mp3` },
  { id: "forest", name: "森", file: `${BASE_PATH}/sounds/forest.mp3` },
  { id: "stream", name: "川", file: `${BASE_PATH}/sounds/stream.mp3` },
];

// Cache decoded audio buffers so we only fetch/decode each file once
const bufferCache = new Map<string, AudioBuffer>();

export async function loadAudioBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  bufferCache.set(url, audioBuffer);
  return audioBuffer;
}

export class NaturePlayer {
  private ctx: AudioContext;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private _isPlaying = false;

  constructor() {
    this.ctx = getAudioContext();
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  async play(soundId: string, volume: number): Promise<void> {
    const sound = NATURE_SOUNDS.find((s) => s.id === soundId);
    if (!sound) return;

    this.stop();

    const buffer = await loadAudioBuffer(this.ctx, sound.file);

    const now = this.ctx.currentTime;

    this.source = this.ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.setValueAtTime(0, now);
    this.gainNode.gain.linearRampToValueAtTime(volume * 0.5, now + 0.5);

    this.source.connect(this.gainNode);
    this.gainNode.connect(getAudioDestination());

    this.source.start(now);
    this._isPlaying = true;
  }

  stop(): void {
    if (this.source) {
      const now = this.ctx.currentTime;
      if (this.gainNode) {
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
      }
      const src = this.source;
      const gain = this.gainNode;
      setTimeout(() => {
        src?.stop();
        src?.disconnect();
        gain?.disconnect();
      }, 350);
      this.source = null;
      this.gainNode = null;
      this._isPlaying = false;
    }
  }

  async playFromUrl(url: string, volume: number): Promise<void> {
    this.stop();

    const buffer = await loadAudioBuffer(this.ctx, url);

    const now = this.ctx.currentTime;

    this.source = this.ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.setValueAtTime(0, now);
    this.gainNode.gain.linearRampToValueAtTime(volume * 0.5, now + 0.5);

    this.source.connect(this.gainNode);
    this.gainNode.connect(getAudioDestination());

    this.source.start(now);
    this._isPlaying = true;
  }

  setVolume(value: number): void {
    const v = Math.max(0, Math.min(1, value)) * 0.5;
    const now = this.ctx.currentTime;
    this.gainNode?.gain.setTargetAtTime(v, now, 0.02);
  }
}
