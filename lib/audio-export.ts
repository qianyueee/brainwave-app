import { ProgramConfig } from "./programs";
import { scheduleRamps } from "./ramp-scheduler";
import type { SynthLayer, VibratoConfig, TremoloConfig } from "./synth-engine";
import { NATURE_SOUNDS } from "./nature-player";
import { getAudioBlob } from "./custom-audio-db";

// --- Types ---

export type ExportFormat = "wav" | "mp3";
export type ExportDuration = 30 | 60 | 300 | 600;

export const EXPORT_DURATIONS: { value: ExportDuration; label: string }[] = [
  { value: 30, label: "30秒" },
  { value: 60, label: "1分" },
  { value: 300, label: "5分" },
  { value: 600, label: "10分" },
];

export type ExportStatus = "idle" | "rendering" | "encoding" | "done" | "error";

export interface ExportProgress {
  status: ExportStatus;
  error?: string;
}

// --- Nature sound helpers ---

async function loadNatureSoundBuffer(
  ctx: OfflineAudioContext,
  soundId: string,
): Promise<AudioBuffer | null> {
  let arrayBuffer: ArrayBuffer;

  if (soundId.startsWith("custom-")) {
    // Custom audio stored in IndexedDB
    const blob = await getAudioBlob(soundId);
    if (!blob) return null;
    arrayBuffer = await blob.arrayBuffer();
  } else {
    // Built-in nature sound — use same path as NaturePlayer
    const sound = NATURE_SOUNDS.find((s) => s.id === soundId);
    if (!sound) return null;
    const response = await fetch(sound.file);
    arrayBuffer = await response.arrayBuffer();
  }

  return ctx.decodeAudioData(arrayBuffer);
}

/** Mix nature sound into an OfflineAudioContext, matching real-time NaturePlayer behavior */
async function mixNatureSound(
  ctx: OfflineAudioContext,
  natureSoundId: string,
  natureVolume: number,
  duration: number,
): Promise<void> {
  const audioBuffer = await loadNatureSoundBuffer(ctx, natureSoundId);
  if (!audioBuffer) return;

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;

  const natureGain = ctx.createGain();
  // Match real-time NaturePlayer: 0.5s fade-in to volume * 0.5
  const targetVol = natureVolume * 0.5;
  natureGain.gain.setValueAtTime(0, 0);
  natureGain.gain.linearRampToValueAtTime(targetVol, 0.5);

  // Fade out at end
  const fadeOutStart = Math.max(0, duration - 0.5);
  natureGain.gain.setValueAtTime(targetVol, fadeOutStart);
  natureGain.gain.linearRampToValueAtTime(0, duration);

  source.connect(natureGain);
  natureGain.connect(ctx.destination);
  source.start(0);
}

// --- Binaural offline rendering ---

// Harmonic overtone config matching real-time engine: [multiplier, gain]
const HARMONICS: readonly [number, number][] = [
  [1, 0.82],   // fundamental
  [2, 0.12],   // 2nd harmonic — adds warmth
  [3, 0.06],   // 3rd harmonic — subtle brightness
];

export async function renderBinauralOffline(
  program: ProgramConfig,
  duration: number,
  beatVolume: number,
  natureSoundId?: string,
  natureVolume?: number,
): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const length = sampleRate * duration;
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const timeScale = duration / program.defaultDuration;
  const carrier = program.carrierFreq;
  const initBeat = program.phases[0].startBeatFreq;

  // Gain nodes
  const vol = Math.max(0, Math.min(1, beatVolume));
  const leftGain = ctx.createGain();
  const rightGain = ctx.createGain();
  leftGain.gain.setValueAtTime(0, 0);
  rightGain.gain.setValueAtTime(0, 0);
  leftGain.gain.linearRampToValueAtTime(vol, 0.05);
  rightGain.gain.linearRampToValueAtTime(vol, 0.05);

  // Fade out at end
  const fadeOutStart = Math.max(0, duration - 0.5);
  leftGain.gain.setValueAtTime(vol, fadeOutStart);
  leftGain.gain.linearRampToValueAtTime(0, duration);
  rightGain.gain.setValueAtTime(vol, fadeOutStart);
  rightGain.gain.linearRampToValueAtTime(0, duration);

  // Channel merger: L/R stereo
  const merger = ctx.createChannelMerger(2);
  leftGain.connect(merger, 0, 0);
  rightGain.connect(merger, 0, 1);
  merger.connect(ctx.destination);

  // Create fundamental + harmonic oscillators matching real-time engine
  let rightFundamental: OscillatorNode | null = null;

  for (const [mult, harmonicGain] of HARMONICS) {
    // Left channel: harmonics at carrier * mult
    const lOsc = ctx.createOscillator();
    lOsc.type = "sine";
    lOsc.frequency.setValueAtTime(carrier * mult, 0);
    const lGain = ctx.createGain();
    lGain.gain.setValueAtTime(harmonicGain, 0);
    lOsc.connect(lGain);
    lGain.connect(leftGain);
    lOsc.start(0);

    // Right channel: fundamental gets beat offset, harmonics are fixed
    const rOsc = ctx.createOscillator();
    rOsc.type = "sine";
    if (mult === 1) {
      rOsc.frequency.setValueAtTime(carrier + initBeat, 0);
      rightFundamental = rOsc;
    } else {
      rOsc.frequency.setValueAtTime(carrier * mult, 0);
    }
    const rGain = ctx.createGain();
    rGain.gain.setValueAtTime(harmonicGain, 0);
    rOsc.connect(rGain);
    rGain.connect(rightGain);
    rOsc.start(0);
  }

  // Schedule frequency ramps on right fundamental oscillator only
  if (rightFundamental) {
    scheduleRamps(rightFundamental, carrier, program.phases, timeScale, 0);
  }

  // Optionally mix nature sound (built-in or custom)
  if (natureSoundId && natureVolume && natureVolume > 0) {
    try {
      await mixNatureSound(ctx, natureSoundId, natureVolume, duration);
    } catch {
      // Nature sound optional — continue without it
    }
  }

  return ctx.startRendering();
}

// --- Synth offline rendering ---

function createOfflineTremolo(
  ctx: OfflineAudioContext,
  config: TremoloConfig,
  tremoloGain: GainNode,
  startTime: number,
  duration: number,
): { lfo?: OscillatorNode; lfoGain?: GainNode } {
  if (!config.enabled || config.depth <= 0) return {};

  const depth = config.depth;

  if (config.mode === "sine") {
    // Match real-time: base gain 1, LFO depth = depth (not depth/2)
    tremoloGain.gain.cancelScheduledValues(startTime);
    tremoloGain.gain.setValueAtTime(1, startTime);

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(config.rate, startTime);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(depth, startTime);

    lfo.connect(lfoGain);
    lfoGain.connect(tremoloGain.gain);
    lfo.start(startTime);

    return { lfo, lfoGain };
  } else {
    // Decay mode: match real-time exponentialRamp behavior
    // Real-time uses setInterval + cancelScheduledValues per cycle;
    // offline must pre-schedule with proper anchor points per cycle.
    const beatPeriod = 1 / config.rate;
    const decayTime = beatPeriod * depth;
    const attackTime = Math.min(0.005, decayTime * 0.05);

    tremoloGain.gain.cancelScheduledValues(startTime);

    const numCycles = Math.ceil(duration / beatPeriod) + 1;
    for (let i = 0; i < numCycles; i++) {
      const t = startTime + i * beatPeriod;
      if (t > startTime + duration) break;

      if (i === 0) {
        // First cycle: immediate start at 1, then decay (no attack phase)
        tremoloGain.gain.setValueAtTime(1, t);
        tremoloGain.gain.exponentialRampToValueAtTime(0.001, t + decayTime);
      } else {
        // Subsequent cycles: anchor at cycle start, attack ramp, then decay
        tremoloGain.gain.setValueAtTime(0.001, t);
        tremoloGain.gain.linearRampToValueAtTime(1, t + attackTime);
        tremoloGain.gain.exponentialRampToValueAtTime(0.001, t + attackTime + decayTime);
      }
    }

    return {};
  }
}

function createOfflineLayerNodes(
  ctx: OfflineAudioContext,
  layer: SynthLayer,
  output: GainNode,
  vibratoGain: GainNode | null,
  startTime: number,
  duration: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.setValueAtTime(layer.frequency, startTime);
  // Match real-time: layer.volume directly (no * 0.5)
  gain.gain.setValueAtTime(layer.volume, startTime);

  if (vibratoGain) {
    vibratoGain.connect(osc.detune);
  }

  const tremoloGain = ctx.createGain();
  tremoloGain.gain.setValueAtTime(1, startTime);

  // Match real-time synth-engine tone types and filter parameters
  if (layer.tone === "soft") {
    // Real-time: triangle + lowpass(1000Hz, Q=3)
    osc.type = "triangle";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1000, startTime);
    filter.Q.setValueAtTime(3, startTime);
    osc.connect(filter);
    filter.connect(tremoloGain);
  } else {
    // Real-time: sawtooth + lowpass(1100Hz, Q=2)
    osc.type = "sawtooth";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1100, startTime);
    filter.Q.setValueAtTime(2, startTime);
    osc.connect(filter);
    filter.connect(tremoloGain);
  }

  tremoloGain.connect(gain);
  gain.connect(output);
  osc.start(startTime);

  // Tremolo
  createOfflineTremolo(ctx, layer.tremolo, tremoloGain, startTime, duration);
}

export async function renderSynthOffline(
  layers: SynthLayer[],
  vibrato: VibratoConfig,
  isStereo: boolean,
  leftLayers?: SynthLayer[],
  rightLayers?: SynthLayer[],
  duration: number = 60,
  natureSoundId?: string,
  natureVolume?: number,
): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const length = sampleRate * duration;
  const ctx = new OfflineAudioContext(2, length, sampleRate);

  // Vibrato LFO (global)
  const vibratoLfo = ctx.createOscillator();
  vibratoLfo.type = "sine";
  vibratoLfo.frequency.setValueAtTime(vibrato.rate, 0);

  const vibratoGainNode = ctx.createGain();
  const cents = vibrato.enabled ? vibrato.depth * 100 : 0;
  vibratoGainNode.gain.setValueAtTime(cents, 0);
  vibratoLfo.connect(vibratoGainNode);
  vibratoLfo.start(0);

  // Fade out timing
  const fadeOutStart = Math.max(0, duration - 0.5);

  if (isStereo && leftLayers && rightLayers) {
    const merger = ctx.createChannelMerger(2);
    const leftGainNode = ctx.createGain();
    const rightGainNode = ctx.createGain();

    // Match real-time: 1/sqrt(N) scaling
    const leftScale = 1 / Math.sqrt(Math.max(leftLayers.length, 1));
    const rightScale = 1 / Math.sqrt(Math.max(rightLayers.length, 1));
    leftGainNode.gain.setValueAtTime(leftScale, 0);
    rightGainNode.gain.setValueAtTime(rightScale, 0);

    // Fade out
    leftGainNode.gain.setValueAtTime(leftScale, fadeOutStart);
    leftGainNode.gain.linearRampToValueAtTime(0, duration);
    rightGainNode.gain.setValueAtTime(rightScale, fadeOutStart);
    rightGainNode.gain.linearRampToValueAtTime(0, duration);

    leftGainNode.connect(merger, 0, 0);
    rightGainNode.connect(merger, 0, 1);
    merger.connect(ctx.destination);

    for (const layer of leftLayers) {
      createOfflineLayerNodes(ctx, layer, leftGainNode, vibratoGainNode, 0, duration);
    }
    for (const layer of rightLayers) {
      createOfflineLayerNodes(ctx, layer, rightGainNode, vibratoGainNode, 0, duration);
    }
  } else {
    // Mono
    const masterGain = ctx.createGain();
    // Match real-time: 1/sqrt(N) scaling
    const scale = 1 / Math.sqrt(Math.max(layers.length, 1));
    masterGain.gain.setValueAtTime(0, 0);
    masterGain.gain.linearRampToValueAtTime(scale, 0.05);

    // Fade out
    masterGain.gain.setValueAtTime(scale, fadeOutStart);
    masterGain.gain.linearRampToValueAtTime(0, duration);

    masterGain.connect(ctx.destination);

    for (const layer of layers) {
      createOfflineLayerNodes(ctx, layer, masterGain, vibratoGainNode, 0, duration);
    }
  }

  // Optionally mix nature sound (built-in or custom)
  if (natureSoundId && natureVolume && natureVolume > 0) {
    try {
      await mixNatureSound(ctx, natureSoundId, natureVolume, duration);
    } catch {
      // Nature sound optional — continue without it
    }
  }

  return ctx.startRendering();
}

// --- WAV encoding ---

export function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2; // 16-bit PCM
  const dataSize = numFrames * numChannels * bytesPerSample;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true); // bits per sample

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channels
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = headerSize;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// --- MP3 encoding ---

export async function encodeMp3(buffer: AudioBuffer): Promise<Blob> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");

  const sampleRate = buffer.sampleRate;
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const encoder = new Mp3Encoder(numChannels, sampleRate, 192);

  const left = floatTo16BitPCM(buffer.getChannelData(0));
  const right = numChannels > 1
    ? floatTo16BitPCM(buffer.getChannelData(1))
    : left;

  const mp3Data: Uint8Array[] = [];
  const blockSize = 1152;

  for (let i = 0; i < left.length; i += blockSize) {
    const leftChunk = left.subarray(i, i + blockSize);
    const rightChunk = right.subarray(i, i + blockSize);
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }
  }

  const flush = encoder.flush();
  if (flush.length > 0) {
    mp3Data.push(new Uint8Array(flush));
  }

  return new Blob(mp3Data as BlobPart[], { type: "audio/mpeg" });
}

function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

// --- Download ---

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- High-level export orchestrators ---

export async function exportBinaural(options: {
  program: ProgramConfig;
  duration: ExportDuration;
  format: ExportFormat;
  beatVolume: number;
  natureSoundId?: string;
  natureVolume?: number;
  onProgress: (p: ExportProgress) => void;
}): Promise<void> {
  const { program, duration, format, beatVolume, natureSoundId, natureVolume, onProgress } = options;

  try {
    onProgress({ status: "rendering" });
    const buffer = await renderBinauralOffline(
      program, duration, beatVolume, natureSoundId, natureVolume,
    );

    onProgress({ status: "encoding" });
    const blob = format === "wav"
      ? encodeWav(buffer)
      : await encodeMp3(buffer);

    const ext = format === "wav" ? "wav" : "mp3";
    const safeName = program.name.replace(/[^\w\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f]/g, "_");
    downloadBlob(blob, `${safeName}_${duration}s.${ext}`);

    onProgress({ status: "done" });
  } catch (err) {
    onProgress({
      status: "error",
      error: err instanceof Error ? err.message : "エクスポートに失敗しました",
    });
  }
}

export async function exportSynth(options: {
  layers: SynthLayer[];
  vibrato: VibratoConfig;
  isStereo: boolean;
  leftLayers?: SynthLayer[];
  rightLayers?: SynthLayer[];
  duration: ExportDuration;
  format: ExportFormat;
  natureSoundId?: string;
  natureVolume?: number;
  onProgress: (p: ExportProgress) => void;
}): Promise<void> {
  const { layers, vibrato, isStereo, leftLayers, rightLayers, duration, format, natureSoundId, natureVolume, onProgress } = options;

  try {
    onProgress({ status: "rendering" });
    const buffer = await renderSynthOffline(
      layers, vibrato, isStereo, leftLayers, rightLayers, duration,
      natureSoundId, natureVolume,
    );

    onProgress({ status: "encoding" });
    const blob = format === "wav"
      ? encodeWav(buffer)
      : await encodeMp3(buffer);

    const ext = format === "wav" ? "wav" : "mp3";
    downloadBlob(blob, `synth_export_${duration}s.${ext}`);

    onProgress({ status: "done" });
  } catch (err) {
    onProgress({
      status: "error",
      error: err instanceof Error ? err.message : "エクスポートに失敗しました",
    });
  }
}
