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

/**
 * A download that receives nothing for this long is given up. A phone that
 * changes networks, or a connection that goes quiet, can leave a fetch hanging
 * without ever failing — and since a play waits for the load already in
 * flight, one hung download used to keep that track's music away until the
 * page was reloaded. A slow download still delivers bytes and is never cut.
 */
const STALL_MS = 15_000;
// Without a readable body (not expected in the browsers we support) progress
// can't be watched, so the whole body gets one longer allowance instead.
const BODY_WITHOUT_STREAM_MS = 60_000;

/**
 * Why a track could not be loaded. The music bed retries the transient kinds
 * for as long as the session plays (lib/audio-engine.ts).
 */
export class AudioLoadError extends Error {
  constructor(
    readonly kind: "network" | "http" | "decode",
    readonly status: number | null,
    message: string
  ) {
    super(message);
    this.name = "AudioLoadError";
  }

  /** No connection, a stalled download, or a server hiccup — worth trying again. */
  get transient(): boolean {
    if (this.kind === "network") return true;
    if (this.kind === "http") return this.status === 408 || this.status === 429 || (this.status ?? 0) >= 500;
    return false;
  }
}

async function fetchBytes(url: string, controller: AbortController): Promise<ArrayBuffer> {
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watch = (ms = STALL_MS) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, ms);
  };
  watch();
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new AudioLoadError("http", response.status, `${response.status} ${url}`);
    if (!response.body) {
      watch(BODY_WITHOUT_STREAM_MS);
      return await response.arrayBuffer();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      watch();
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  } catch (err) {
    if (err instanceof AudioLoadError) throw err;
    // Abandoned by everyone who wanted it (see release) — not a failure.
    if (controller.signal.aborted && !stalled) throw err;
    throw new AudioLoadError("network", null, `${stalled ? "stalled" : String(err)} ${url}`);
  } finally {
    clearTimeout(timer);
  }
}

async function decode(decoder: BaseAudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  try {
    return await decoder.decodeAudioData(bytes);
  } catch (err) {
    // A track that decodes on a desktop can still fail on a phone for lack of
    // memory. Let go of the decoded tracks kept for replays (one that is
    // playing stays alive through its own source node) so a retry has room.
    bufferCache.clear();
    throw new AudioLoadError("decode", null, String(err));
  }
}

/**
 * A fetch + decode in flight. A play pressed while a preload is still running
 * waits for it instead of fetching and decoding the same track a second time.
 * `users` counts who is waiting for it (the player page's preload, a session);
 * when the last one stops waiting, the download is abandoned.
 */
interface Load {
  promise: Promise<AudioBuffer>;
  controller: AbortController;
  users: number;
  settled: boolean;
}

const loading = new Map<string, Load>();

function startLoad(url: string, decoder: BaseAudioContext): Load {
  const controller = new AbortController();
  const promise = fetchBytes(url, controller)
    .then((bytes) => decode(decoder, bytes))
    .then((buffer) => {
      remember(url, buffer);
      return buffer;
    });
  const entry: Load = { promise, controller, users: 0, settled: false };
  loading.set(url, entry);
  // A failed load is forgotten; the next attempt starts afresh.
  const forget = () => {
    entry.settled = true;
    if (loading.get(url) === entry) loading.delete(url);
  };
  promise.then(forget, forget);
  return entry;
}

function release(entry: Load): void {
  entry.users--;
  // Only the download can be cut short; a decode already under way finishes
  // and its track is kept for later.
  if (entry.users <= 0 && !entry.settled) entry.controller.abort();
}

function abortError(): Error {
  return new DOMException("The load was stopped", "AbortError");
}

/** Wait for `entry` as one of its users, until it settles or `signal` aborts. */
function waitFor(entry: Load, signal?: AbortSignal): Promise<AudioBuffer> {
  if (signal?.aborted) return Promise.reject(abortError());
  entry.users++;
  return new Promise<AudioBuffer>((resolve, reject) => {
    let waiting = true;
    const stopWaiting = () => {
      if (!waiting) return false;
      waiting = false;
      signal?.removeEventListener("abort", onAbort);
      release(entry);
      return true;
    };
    const onAbort = () => {
      if (stopWaiting()) reject(abortError());
    };
    signal?.addEventListener("abort", onAbort);
    entry.promise.then(
      (buffer) => {
        if (stopWaiting()) resolve(buffer);
      },
      (err) => {
        if (stopWaiting()) reject(err);
      }
    );
  });
}

// Preloads decode on an offline context: no realtime AudioContext exists
// before the first tap (autoplay rules), and a buffer decoded offline plays
// in the realtime one as is. 48kHz is the tracks' own rate — no resampling.
let offlineDecoder: OfflineAudioContext | null = null;

// The preload the player page asked for last. Only one is kept going: the
// program now on screen is the one about to be played, and the tracks of the
// programs looked at before it would only take bandwidth (and the decoder,
// which works through one track at a time) away from it.
let preloading: Load | null = null;

/**
 * Fetch and decode a track before the play button is pressed (the player
 * page does this for the program on screen). Decoding alone takes a second or
 * more for a 3-minute track, and the beat waits for the music to begin
 * (lib/music-intro.ts) — done ahead, pressing play starts both at once.
 */
export function preloadAudio(url: string): void {
  const previous = preloading;
  if (previous && loading.get(url) === previous) return;
  if (previous) {
    preloading = null;
    release(previous); // abandoned unless a session is waiting for it too
  }
  if (bufferCache.has(url)) return;
  if (typeof OfflineAudioContext === "undefined") return;
  try {
    offlineDecoder ??= new OfflineAudioContext(2, 1, 48000);
  } catch {
    return;
  }
  const entry = loading.get(url) ?? startLoad(url, offlineDecoder);
  entry.users++;
  preloading = entry;
  // Done either way; a failed preload is forgotten and playback tries again.
  const done = () => {
    if (preloading !== entry) return;
    preloading = null;
    release(entry);
  };
  entry.promise.then(done, done);
}

/**
 * The decoded track at `url`: from the cache, from the load already in flight,
 * or fetched and decoded now. `signal` stops waiting (a session that ended);
 * the download itself goes on only while someone else still waits for it.
 */
export async function loadAudioBuffer(
  ctx: AudioContext,
  url: string,
  signal?: AbortSignal
): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) {
    remember(url, cached);
    return cached;
  }
  const inFlight = loading.get(url);
  if (inFlight) {
    try {
      return await waitFor(inFlight, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      // The preload failed (network); fetch again below.
    }
    const loaded = bufferCache.get(url);
    if (loaded) return loaded;
  }
  return waitFor(loading.get(url) ?? startLoad(url, ctx), signal);
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
        try {
          src?.stop();
        } catch {
          // Never started — nothing to stop, but still disconnect below.
        }
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
    // Hold at 0 from no later than the curve's start: an event inside the
    // curve's span is an overlap the engine may reject, and then the track
    // never starts.
    this.fadeNode.gain.setValueAtTime(0, Math.min(now, fadeIn.at));
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
