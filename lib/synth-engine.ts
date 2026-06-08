import { getAudioContext } from "./audio-context";
import { getAudioDestination } from "./keep-alive";

export type ToneType = "soft" | "bright";
export type TremoloMode = "sine" | "decay";

export interface TremoloConfig {
  enabled: boolean;
  mode: TremoloMode;
  rate: number;   // 0.01-60 Hz
  depth: number;  // 0-1
}

export const DEFAULT_TREMOLO: TremoloConfig = {
  enabled: false,
  mode: "sine",
  rate: 2,
  depth: 0.5,
};

export interface VibratoConfig {
  enabled: boolean;
  rate: number;   // 0.01-60 Hz
  depth: number;  // 0-1 (100% = ±100 cents)
}

export const DEFAULT_VIBRATO: VibratoConfig = {
  enabled: false,
  rate: 5,
  depth: 0.5,
};

export interface SynthLayer {
  id: string;
  frequency: number; // 20-10000 Hz
  volume: number; // 0-1
  tone: ToneType;
  tremolo: TremoloConfig;
}

export interface SynthPreset {
  id: string;
  name: string;
  layers: SynthLayer[];
  leftLayers?: SynthLayer[];
  rightLayers?: SynthLayer[];
  vibrato: VibratoConfig;
  editorMode?: string;
  createdAt: string;
  /**
   * Optional time-axis timeline. When present, this preset describes an ordered
   * sequence of segments instead of a single static config. Stored INSIDE the
   * preset so it rides the `preset` JSONB column through every persistence path
   * (localStorage, Supabase upsert/list, publish) with no sync-layer changes.
   * A segment's own `preset` leaves `timeline` undefined.
   */
  timeline?: { segments: TimelineSegment[] };
}

/** One time segment of a timeline custom program. */
export interface TimelineSegment {
  id: string;
  name?: string;
  /** Length of this segment in seconds (clamped to >= 1). */
  durationSec: number;
  /** Crossfade seconds INTO this segment from the previous one (0 = hard cut). */
  crossfadeSec: number;
  /** The synth config for this segment (layers + vibrato). `timeline` stays unset. */
  preset: SynthPreset;
}

interface TremoloNodes {
  lfo: OscillatorNode | null;
  lfoGain: GainNode | null;
  decayTimer: ReturnType<typeof setInterval> | null;
}

interface LayerNodes {
  osc: OscillatorNode;
  filter: BiquadFilterNode | null;
  gain: GainNode;
  tremoloGain: GainNode;
  tremolo: TremoloNodes;
}

export type MonitorChannel = "both" | "left" | "right";

export class SynthSession {
  private ctx: AudioContext;
  private layerNodes = new Map<string, LayerNodes>();
  private masterGain: GainNode | null = null;
  private _isPlaying = false;
  private _isStereo = false;

  // Stereo routing
  private merger: ChannelMergerNode | null = null;
  private leftGain: GainNode | null = null;
  private rightGain: GainNode | null = null;
  // Track which channel each layer belongs to for stereo
  private layerChannels = new Map<string, "left" | "right">();

  // Solo monitor state (stereo only)
  private _monitor: MonitorChannel = "both";
  private _userVolume = 1;

  // Global vibrato LFO
  private vibratoLfo: OscillatorNode | null = null;
  private vibratoGain: GainNode | null = null;

  constructor() {
    this.ctx = getAudioContext();
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /** Start in mono mode (all layers to both channels) */
  start(layers: SynthLayer[], vibrato?: VibratoConfig): void {
    if (this._isPlaying) return;
    this._isStereo = false;
    this.initAudio(layers.length, vibrato);

    const now = this.ctx.currentTime;
    for (const layer of layers) {
      this.createLayerNodes(layer, now);
    }
    this._isPlaying = true;
  }

  /** Start in stereo mode (left/right layers to separate channels) */
  startStereo(leftLayers: SynthLayer[], rightLayers: SynthLayer[], vibrato?: VibratoConfig): void {
    if (this._isPlaying) return;
    this._isStereo = true;

    const totalLayers = leftLayers.length + rightLayers.length;
    this.initAudio(totalLayers, vibrato);

    const now = this.ctx.currentTime;

    // Create stereo routing: merger → destination
    this.merger = this.ctx.createChannelMerger(2);
    this.leftGain = this.ctx.createGain();
    this.rightGain = this.ctx.createGain();

    const leftScale = 1 / Math.sqrt(Math.max(leftLayers.length, 1));
    const rightScale = 1 / Math.sqrt(Math.max(rightLayers.length, 1));
    this.leftGain.gain.setValueAtTime(leftScale, now);
    this.rightGain.gain.setValueAtTime(rightScale, now);

    this.leftGain.connect(this.merger, 0, 0);
    this.rightGain.connect(this.merger, 0, 1);
    this.merger.connect(getAudioDestination());

    // Fade in via masterGain (connected to destination for vibrato, but layers bypass it in stereo)
    // Actually for stereo, layers connect to leftGain/rightGain instead of masterGain
    // masterGain is not used for routing in stereo — set it to silent
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(0, now);
    }

    for (const layer of leftLayers) {
      this.layerChannels.set(layer.id, "left");
      this.createLayerNodes(layer, now);
    }
    for (const layer of rightLayers) {
      this.layerChannels.set(layer.id, "right");
      this.createLayerNodes(layer, now);
    }

    this._isPlaying = true;
  }

  private initAudio(totalLayers: number, vibrato?: VibratoConfig): void {
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;

    // masterGain used for mono routing; in stereo it's a dummy
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.connect(getAudioDestination());

    if (!this._isStereo) {
      const scale = 1 / Math.sqrt(Math.max(totalLayers, 1));
      this.masterGain.gain.linearRampToValueAtTime(scale, now + 0.05);
    }

    // Vibrato LFO
    this.vibratoLfo = this.ctx.createOscillator();
    this.vibratoLfo.type = "sine";
    this.vibratoGain = this.ctx.createGain();

    const vib = vibrato ?? DEFAULT_VIBRATO;
    this.vibratoLfo.frequency.setValueAtTime(vib.rate, now);
    const cents = vib.enabled ? vib.depth * 100 : 0;
    this.vibratoGain.gain.setValueAtTime(cents, now);

    this.vibratoLfo.connect(this.vibratoGain);
    this.vibratoLfo.start(now);
  }

  stop(): void {
    if (!this._isPlaying) return;
    this._isPlaying = false;

    // Stop all decay timers immediately so they don't cancel the fade-out ramp
    for (const [, nodes] of this.layerNodes) {
      if (nodes.tremolo.decayTimer) {
        clearInterval(nodes.tremolo.decayTimer);
        nodes.tremolo.decayTimer = null;
      }
    }

    const now = this.ctx.currentTime;
    const fadeOut = 0.2;

    // Fade out all outputs
    if (this._isStereo) {
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
    } else if (this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0, now + fadeOut);
    }

    setTimeout(() => {
      for (const [, nodes] of this.layerNodes) {
        this.destroyTremolo(nodes.tremolo);
        this.destroyLayerNodes(nodes);
      }
      this.layerNodes.clear();
      this.layerChannels.clear();

      this.masterGain?.disconnect();
      this.masterGain = null;
      this.leftGain?.disconnect();
      this.rightGain?.disconnect();
      this.merger?.disconnect();
      this.leftGain = null;
      this.rightGain = null;
      this.merger = null;

      this.vibratoLfo?.stop();
      this.vibratoLfo?.disconnect();
      this.vibratoGain?.disconnect();
      this.vibratoLfo = null;
      this.vibratoGain = null;
    }, fadeOut * 1000 + 50);
  }

  /** Adjust master volume (0-1) for external control (e.g. Mixer) */
  setMasterVolume(value: number): void {
    const v = Math.max(0, Math.min(1, value));
    this._userVolume = v;
    const now = this.ctx.currentTime;
    if (this._isStereo) {
      this.applyChannelGain("left");
      this.applyChannelGain("right");
    } else if (this.masterGain) {
      const scale = 1 / Math.sqrt(Math.max(this.layerNodes.size, 1));
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.setTargetAtTime(v * scale, now, 0.02);
    }
  }

  /**
   * Linearly ramp the master/channel output toward `value` (0-1 user volume) over
   * `seconds`. Used by the timeline engine for crossfades between segments.
   * `seconds <= 0` performs a hard set. When `fromSilent` is true the ramp starts
   * from 0 (for fading a freshly-started segment in over a previously-running one).
   */
  fadeMasterVolume(value: number, seconds: number, fromSilent = false): void {
    const v = Math.max(0, Math.min(1, value));
    this._userVolume = v;
    const now = this.ctx.currentTime;
    if (this._isStereo) {
      this.applyChannelGain("left", seconds, true, fromSilent);
      this.applyChannelGain("right", seconds, true, fromSilent);
    } else if (this.masterGain) {
      const scale = 1 / Math.sqrt(Math.max(this.layerNodes.size, 1));
      const target = v * scale;
      const g = this.masterGain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(fromSilent ? 0 : g.value, now);
      if (seconds <= 0) {
        g.setValueAtTime(target, now);
      } else {
        g.linearRampToValueAtTime(target, now + seconds);
      }
    }
  }

  /** Solo monitor in stereo mode: hear only L, only R, or both. No-op in mono. */
  setMonitorChannel(channel: MonitorChannel): void {
    this._monitor = channel;
    if (!this._isStereo) return;
    this.applyChannelGain("left");
    this.applyChannelGain("right");
  }

  // --- Vibrato ---

  setVibrato(config: VibratoConfig): void {
    if (!this.vibratoLfo || !this.vibratoGain) return;
    const now = this.ctx.currentTime;
    this.vibratoLfo.frequency.setTargetAtTime(config.rate, now, 0.02);
    const cents = config.enabled ? config.depth * 100 : 0;
    this.vibratoGain.gain.setTargetAtTime(cents, now, 0.02);
  }

  // --- Per-layer controls ---

  setLayerFrequency(id: string, freq: number): void {
    const nodes = this.layerNodes.get(id);
    if (!nodes) return;
    nodes.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
  }

  setLayerVolume(id: string, volume: number): void {
    const nodes = this.layerNodes.get(id);
    if (!nodes) return;
    const v = Math.max(0, Math.min(1, volume));
    nodes.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setLayerTone(id: string, tone: ToneType, layer: SynthLayer): void {
    const nodes = this.layerNodes.get(id);
    if (!nodes) return;

    const now = this.ctx.currentTime;
    this.destroyTremolo(nodes.tremolo);
    this.destroyLayerNodes(nodes);
    this.layerNodes.delete(id);

    this.createLayerNodes({ ...layer, tone }, now);
  }

  setLayerTremolo(id: string, tremolo: TremoloConfig): void {
    const nodes = this.layerNodes.get(id);
    if (!nodes) return;

    const now = this.ctx.currentTime;
    const { tremoloGain } = nodes;

    this.destroyTremolo(nodes.tremolo);
    tremoloGain.gain.cancelScheduledValues(now);
    tremoloGain.gain.setTargetAtTime(1, now, 0.02);
    nodes.tremolo = this.createTremolo(tremolo, tremoloGain, now);
  }

  addLayer(layer: SynthLayer, channel?: "left" | "right"): void {
    if (!this._isPlaying) return;
    if (this._isStereo && channel) {
      this.layerChannels.set(layer.id, channel);
    }
    this.createLayerNodes(layer, this.ctx.currentTime);
    if (!this._isStereo) {
      this.updateMasterScale();
    } else {
      this.updateChannelScale(channel ?? "left");
    }
  }

  removeLayer(id: string): void {
    const nodes = this.layerNodes.get(id);
    if (!nodes) return;
    const channel = this.layerChannels.get(id);
    this.destroyTremolo(nodes.tremolo);
    this.destroyLayerNodes(nodes);
    this.layerNodes.delete(id);
    this.layerChannels.delete(id);
    if (!this._isStereo) {
      this.updateMasterScale();
    } else if (channel) {
      this.updateChannelScale(channel);
    }
  }

  private getOutputForLayer(layerId: string): GainNode | null {
    if (!this._isStereo) return this.masterGain;
    const channel = this.layerChannels.get(layerId);
    if (channel === "left") return this.leftGain;
    if (channel === "right") return this.rightGain;
    return this.masterGain;
  }

  private createLayerNodes(layer: SynthLayer, now: number): void {
    const output = this.getOutputForLayer(layer.id);
    if (!output) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    let filter: BiquadFilterNode | null = null;

    osc.frequency.setValueAtTime(layer.frequency, now);
    gain.gain.setValueAtTime(layer.volume, now);

    if (this.vibratoGain) {
      this.vibratoGain.connect(osc.detune);
    }

    const tremoloGain = this.ctx.createGain();
    tremoloGain.gain.setValueAtTime(1, now);

    if (layer.tone === "soft") {
      osc.type = "triangle";
      filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1000, now);
      filter.Q.setValueAtTime(3, now);
      osc.connect(filter);
      filter.connect(tremoloGain);
    } else {
      osc.type = "sawtooth";
      filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1100, now);
      filter.Q.setValueAtTime(2, now);
      osc.connect(filter);
      filter.connect(tremoloGain);
    }

    tremoloGain.connect(gain);
    gain.connect(output);
    osc.start(now);

    const tremolo = this.createTremolo(layer.tremolo, tremoloGain, now);
    this.layerNodes.set(layer.id, { osc, filter, gain, tremoloGain, tremolo });
  }

  private createTremolo(config: TremoloConfig, tremoloGain: GainNode, now: number): TremoloNodes {
    const empty: TremoloNodes = { lfo: null, lfoGain: null, decayTimer: null };
    if (!config.enabled) return empty;
    // Sine: depth = modulation amplitude (0 = no modulation)
    // Decay: depth = sustain level reached at end of each beat (0 = full decay to silence, 1 = no decay)
    if (config.mode === "sine" && config.depth <= 0) return empty;

    const depth = config.depth;

    if (config.mode === "sine") {
      const freq = config.rate;
      tremoloGain.gain.cancelScheduledValues(now);
      tremoloGain.gain.setValueAtTime(1, now);

      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(freq, now);

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(depth, now);

      lfo.connect(lfoGain);
      lfoGain.connect(tremoloGain.gain);
      lfo.start(now);

      return { lfo, lfoGain, decayTimer: null };
    } else {
      const beatPeriod = 1 / config.rate;
      const attackTime = Math.min(0.005, beatPeriod * 0.05); // 5ms attack to avoid pop
      const decayTime = Math.max(beatPeriod - attackTime, 0.001);
      // exponentialRampToValueAtTime cannot reach exactly 0; clamp to -60dB
      const target = Math.max(depth, 0.001);

      tremoloGain.gain.cancelScheduledValues(now);
      tremoloGain.gain.setValueAtTime(1, now);
      tremoloGain.gain.exponentialRampToValueAtTime(target, now + decayTime);

      const decayTimer = setInterval(() => {
        if (!this._isPlaying) return;
        const t = this.ctx.currentTime;
        tremoloGain.gain.cancelScheduledValues(t);
        tremoloGain.gain.setValueAtTime(tremoloGain.gain.value, t);
        tremoloGain.gain.linearRampToValueAtTime(1, t + attackTime);
        tremoloGain.gain.exponentialRampToValueAtTime(target, t + attackTime + decayTime);
      }, beatPeriod * 1000);

      return { lfo: null, lfoGain: null, decayTimer };
    }
  }

  private destroyTremolo(t: TremoloNodes): void {
    if (t.decayTimer) clearInterval(t.decayTimer);
    if (t.lfo) {
      t.lfo.stop();
      t.lfo.disconnect();
    }
    t.lfoGain?.disconnect();
  }

  private destroyLayerNodes(nodes: LayerNodes): void {
    nodes.osc.stop();
    nodes.osc.disconnect();
    nodes.filter?.disconnect();
    nodes.tremoloGain.disconnect();
    nodes.gain.disconnect();
  }

  private updateMasterScale(): void {
    if (!this.masterGain) return;
    const scale = 1 / Math.sqrt(Math.max(this.layerNodes.size, 1));
    this.masterGain.gain.setTargetAtTime(scale, this.ctx.currentTime, 0.02);
  }

  private updateChannelScale(channel: "left" | "right"): void {
    this.applyChannelGain(channel);
  }

  private applyChannelGain(
    channel: "left" | "right",
    rampSeconds = 0.02,
    useLinear = false,
    fromSilent = false,
  ): void {
    const node = channel === "left" ? this.leftGain : this.rightGain;
    if (!node) return;
    let count = 0;
    for (const [, ch] of this.layerChannels) {
      if (ch === channel) count++;
    }
    const baseScale = 1 / Math.sqrt(Math.max(count, 1));
    const monitorMul = this._monitor === "both" || this._monitor === channel ? 1 : 0;
    const target = baseScale * this._userVolume * monitorMul;
    const now = this.ctx.currentTime;
    const g = node.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(fromSilent ? 0 : g.value, now);
    if (rampSeconds <= 0) {
      g.setValueAtTime(target, now);
    } else if (useLinear) {
      g.linearRampToValueAtTime(target, now + rampSeconds);
    } else {
      g.setTargetAtTime(target, now, rampSeconds);
    }
  }
}
