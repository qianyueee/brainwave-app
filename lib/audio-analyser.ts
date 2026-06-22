/**
 * A single shared AnalyserNode tapped into the audio graph so visuals can
 * react to the live signal level.
 *
 * The analyser is a transparent pass-through: engines connect their final node
 * into it, and it connects once to getAudioDestination() (the same
 * MediaStreamDestination used for background <audio> playback). It does not
 * alter the audio.
 *
 * It is created lazily by the engines during playback start() — i.e. inside a
 * user gesture — so we never spin up an AudioContext just to read a level.
 */

import { getAudioContext } from "./audio-context";
import { getAudioDestination } from "./keep-alive";

// Tunable constants
const FFT_SIZE = 1024; // power of two; 512 bins, cheap, low latency
const SMOOTHING = 0.8; // analyser internal smoothing
const LEVEL_ATTACK = 0.3; // rise speed toward a louder reading
const LEVEL_RELEASE = 0.08; // fall speed (slower = gentle "breathing")
const RMS_GAIN = 1.6; // normalize: full-scale sine RMS ≈ 0.707

let analyser: AnalyserNode | null = null;
let timeBuf: Uint8Array<ArrayBuffer> | null = null;
let smoothedLevel = 0;

/**
 * Lazily create the shared analyser on the singleton AudioContext and wire
 * analyser -> getAudioDestination() exactly once. Safe to call repeatedly.
 * Returns null on the server or if the context can't be created.
 */
export function getSharedAnalyser(): AnalyserNode | null {
  if (typeof window === "undefined") return null;
  if (analyser) return analyser;
  try {
    const ctx = getAudioContext();
    const a = ctx.createAnalyser();
    a.fftSize = FFT_SIZE;
    a.smoothingTimeConstant = SMOOTHING;
    a.connect(getAudioDestination());
    analyser = a;
    timeBuf = new Uint8Array(new ArrayBuffer(a.fftSize));
    return analyser;
  } catch {
    return null;
  }
}

/**
 * 0..1 smoothed amplitude (RMS of the time-domain waveform). Returns a value
 * decaying toward 0 when nothing is playing / no analyser exists yet. Does NOT
 * create an AudioContext — the analyser only appears once playback has started.
 */
export function getAudioLevel(): number {
  if (!analyser || !timeBuf) {
    smoothedLevel *= 0.9;
    return smoothedLevel;
  }
  analyser.getByteTimeDomainData(timeBuf);
  let sumSq = 0;
  for (let i = 0; i < timeBuf.length; i++) {
    const v = (timeBuf[i] - 128) / 128; // -1..1
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / timeBuf.length);
  const raw = Math.min(1, rms * RMS_GAIN);
  const k = raw > smoothedLevel ? LEVEL_ATTACK : LEVEL_RELEASE;
  smoothedLevel += (raw - smoothedLevel) * k;
  return smoothedLevel;
}
