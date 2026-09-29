import { getAudioContext } from "./audio-context";
import { getAudioDestination } from "./keep-alive";
import { soundUrl } from "./sounds";

export interface NatureSoundConfig {
  id: string;
  name: string;
  /** 英語の画面の名前 */
  nameEn: string;
  file: string;
}

export const NATURE_SOUNDS: NatureSoundConfig[] = [
  { id: "rain", name: "雨", nameEn: "Rain", file: soundUrl("rain.mp3") },
  { id: "ocean", name: "海", nameEn: "Ocean", file: soundUrl("ocean.mp3") },
  { id: "forest", name: "森", nameEn: "Forest", file: soundUrl("forest.mp3") },
  { id: "stream", name: "川", nameEn: "Stream", file: soundUrl("stream.mp3") },
];

// Decoded audio, kept per URL so a replay needs no fetch/decode — but only
// the most recent MAX_DECODED: decoded PCM is ~23MB a minute (48kHz stereo
// float) and the music beds run 1–8 minutes, so holding every track played
// in a session would exhaust a phone's WebView. Using an entry moves it to
// the back, so what is playing now stays.
const MAX_DECODED = 2;
const bufferCache = new Map<string, AudioBuffer>();

function remember(url: string, buffer: AudioBuffer): void {
  bufferCache.delete(url);
  bufferCache.set(url, buffer);
  while (bufferCache.size > MAX_DECODED) {
    const oldest = bufferCache.keys().next().value;
    if (oldest === undefined) break;
    bufferCache.delete(oldest);
  }
}

// Loads in flight, so a play pressed while a preload is still running waits
// for it instead of fetching and decoding the same track a second time.
const loading = new Map<string, Promise<AudioBuffer>>();

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.arrayBuffer();
}

function load(url: string, decoder: BaseAudioContext): Promise<AudioBuffer> {
  const promise = fetchBytes(url)
    .then((bytes) => decoder.decodeAudioData(bytes))
    .then((buffer) => {
      remember(url, buffer);
      return buffer;
    });
  loading.set(url, promise);
  const forget = () => {
    if (loading.get(url) === promise) loading.delete(url);
  };
  promise.then(forget, forget);
  return promise;
}

// Preloads decode on an offline context: no realtime AudioContext exists
// before the first tap (autoplay rules), and a buffer decoded offline plays
// in the realtime one as is. 48kHz is the tracks' own rate — no resampling.
let offlineDecoder: OfflineAudioContext | null = null;

/**
 * Fetch and decode a track before the play button is pressed (the player
 * page does this for the program on screen). Decoding alone takes a second or
 * more for a 3-minute track, and the beat waits for the music to begin
 * (lib/music-intro.ts) — done ahead, pressing play starts both at once.
 */
export function preloadAudio(url: string): void {
  if (bufferCache.has(url) || loading.has(url)) return;
  if (typeof OfflineAudioContext === "undefined") return;
  try {
    offlineDecoder ??= new OfflineAudioContext(2, 1, 48000);
  } catch {
    return;
  }
  // A failed preload is forgotten (see load); playback just tries again.
  load(url, offlineDecoder).catch(() => {});
}

export async function loadAudioBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) {
    remember(url, cached);
    return cached;
  }
  const inFlight = loading.get(url);
  if (inFlight) {
    try {
      return await inFlight;
    } catch {
      // The preload failed (network); fetch again below.
    }
  }
  return load(url, ctx);
}

export class NaturePlayer {
  private ctx: AudioContext;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  // Start fade, ahead of the volume gain (playBuffer only).
  private fadeNode: GainNode | null = null;
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
      const fade = this.fadeNode;
      setTimeout(() => {
        src?.stop();
        src?.disconnect();
        fade?.disconnect();
        gain?.disconnect();
      }, 350);
      this.source = null;
      this.gainNode = null;
      this.fadeNode = null;
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

  /**
   * Loop an already-decoded track (the music bed), starting at `fadeIn.at` and
   * rising along `fadeIn.curve` — the same moment and shape the session gives
   * the beat (lib/music-intro.ts). The curve lives on its own gain ahead of the
   * volume gain, which holds the target volume from the start, so moving the
   * music slider mid-fade neither breaks the curve nor collides with it.
   */
  playBuffer(
    buffer: AudioBuffer,
    volume: number,
    fadeIn: { at: number; curve: Float32Array; duration: number }
  ): void {
    this.stop();

    const now = this.ctx.currentTime;

    this.source = this.ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;

    this.fadeNode = this.ctx.createGain();
    this.fadeNode.gain.setValueAtTime(0, now);
    this.fadeNode.gain.setValueCurveAtTime(fadeIn.curve, fadeIn.at, fadeIn.duration);

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, volume)) * 0.5, now);

    this.source.connect(this.fadeNode);
    this.fadeNode.connect(this.gainNode);
    this.gainNode.connect(getAudioDestination());

    this.source.start(fadeIn.at);
    this._isPlaying = true;
  }

  setVolume(value: number): void {
    const v = Math.max(0, Math.min(1, value)) * 0.5;
    const now = this.ctx.currentTime;
    this.gainNode?.gain.setTargetAtTime(v, now, 0.02);
  }
}
