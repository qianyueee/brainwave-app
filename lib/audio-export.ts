import { ProgramConfig } from "./programs";
import { scheduleRamps } from "./ramp-scheduler";
import type { SynthLayer, VibratoConfig, TremoloConfig } from "./synth-engine";

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

// --- Binaural offline rendering ---

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

  // Left oscillator = carrier
  const leftOsc = ctx.createOscillator();
  leftOsc.type = "sine";
  leftOsc.frequency.setValueAtTime(program.carrierFreq, 0);

  // Right oscillator = carrier + beat
  const rightOsc = ctx.createOscillator();
  rightOsc.type = "sine";
  rightOsc.frequency.setValueAtTime(
    program.carrierFreq + program.phases[0].startBeatFreq,
    0,
  );

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
  leftOsc.connect(leftGain);
  leftGain.connect(merger, 0, 0);
  rightOsc.connect(rightGain);
  rightGain.connect(merger, 0, 1);
  merger.connect(ctx.destination);

  // Schedule frequency ramps
  scheduleRamps(rightOsc, program.carrierFreq, program.phases, timeScale, 0);

  // Optionally load nature sound
  if (natureSoundId && natureVolume && natureVolume > 0) {
    try {
      const response = await fetch(`/sounds/${natureSoundId}.mp3`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      const natureGain = ctx.createGain();
      natureGain.gain.setValueAtTime(natureVolume * 0.5, 0);
      // Fade out nature too
      natureGain.gain.setValueAtTime(natureVolume * 0.5, fadeOutStart);
      natureGain.gain.linearRampToValueAtTime(0, duration);
      source.connect(natureGain);
      natureGain.connect(ctx.destination);
      source.start(0);
    } catch {
      // Nature sound optional — continue without it
    }
  }

  leftOsc.start(0);
  rightOsc.start(0);

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
    tremoloGain.gain.cancelScheduledValues(startTime);
    tremoloGain.gain.setValueAtTime(1 - depth / 2, startTime);

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(config.rate, startTime);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(depth / 2, startTime);

    lfo.connect(lfoGain);
    lfoGain.connect(tremoloGain.gain);
    lfo.start(startTime);

    return { lfo, lfoGain };
  } else {
    // Decay mode: pre-schedule all setValueAtTime/setTargetAtTime pairs
    const beatPeriod = 1 / config.rate;
    const minGain = 1 - depth;
    const tau = beatPeriod / 3;

    tremoloGain.gain.cancelScheduledValues(startTime);

    const numCycles = Math.ceil(duration / beatPeriod) + 1;
    for (let i = 0; i < numCycles; i++) {
      const t = startTime + i * beatPeriod;
      if (t > startTime + duration) break;
      tremoloGain.gain.setValueAtTime(1, t);
      tremoloGain.gain.setTargetAtTime(minGain, t, tau);
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
  gain.gain.setValueAtTime(layer.volume * 0.5, startTime);

  if (vibratoGain) {
    vibratoGain.connect(osc.detune);
  }

  const tremoloGain = ctx.createGain();
  tremoloGain.gain.setValueAtTime(1, startTime);

  if (layer.tone === "soft") {
    osc.type = "sine";
    osc.connect(tremoloGain);
  } else {
    osc.type = "sawtooth";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, startTime);
    filter.Q.setValueAtTime(0.707, startTime);
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

    const leftScale = 1 / Math.max(leftLayers.length, 1);
    const rightScale = 1 / Math.max(rightLayers.length, 1);
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
    const scale = 1 / Math.max(layers.length, 1);
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
  const { Mp3Encoder } = await import("lamejs");

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
  onProgress: (p: ExportProgress) => void;
}): Promise<void> {
  const { layers, vibrato, isStereo, leftLayers, rightLayers, duration, format, onProgress } = options;

  try {
    onProgress({ status: "rendering" });
    const buffer = await renderSynthOffline(
      layers, vibrato, isStereo, leftLayers, rightLayers, duration,
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
