import type { MindDataSource, MindSourceHandlers } from "./data-source";
import type { EegSample, Quadrant } from "./types";
import { SPECTRUM_MAX_HZ } from "./types";

/** Quadrant centers the hidden target wanders between (attention, meditation). */
const QUADRANT_CENTERS: Record<Quadrant, [number, number]> = {
  flow: [75, 75],
  stress: [75, 25],
  fatigue: [25, 25],
  deepMeditation: [25, 75],
};

function gauss(): number {
  // Box-Muller, good enough for demo noise
  const u = Math.random() || 1e-9;
  const v = Math.random() || 1e-9;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Lognormal-ish jitter multiplier around 1. */
function jitter(spread = 0.35): number {
  return Math.exp(gauss() * spread);
}

/**
 * Organic-looking demo feed: attention/meditation follow an
 * Ornstein-Uhlenbeck-style walk toward a hidden target that hops between
 * quadrant centers every 8-15 s, so the dot visits all four areas over time.
 * Band powers are correlated with the state and use TGAM-like magnitudes;
 * gamma has a low baseline with occasional bursts to demo the glow effect.
 */
export class DummySource implements MindDataSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private att = 55;
  private med = 55;
  private attT = 70;
  private medT = 70;
  private nextRetarget = 0;
  private gammaBurstUntil = 0;
  private nextGammaBurst = 0;

  constructor(private handlers: MindSourceHandlers) {}

  start(): void {
    const now = Date.now();
    this.nextRetarget = now + 8000;
    this.nextGammaBurst = now + 12000;
    this.handlers.onStatus("connected", "デモモード");
    this.tick(); // emit immediately so the UI doesn't wait a second
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const now = Date.now();

    if (now >= this.nextRetarget) {
      const quadrants = Object.keys(QUADRANT_CENTERS) as Quadrant[];
      const q = quadrants[Math.floor(Math.random() * quadrants.length)];
      const [a, m] = QUADRANT_CENTERS[q];
      this.attT = clamp(a + (Math.random() - 0.5) * 30, 5, 95);
      this.medT = clamp(m + (Math.random() - 0.5) * 30, 5, 95);
      this.nextRetarget = now + 8000 + Math.random() * 7000;
    }
    if (now >= this.nextGammaBurst) {
      this.gammaBurstUntil = now + 5000 + Math.random() * 5000;
      this.nextGammaBurst = now + 25000 + Math.random() * 20000;
    }

    this.att = clamp(this.att + (this.attT - this.att) * 0.08 + gauss() * 2.5, 0, 100);
    this.med = clamp(this.med + (this.medT - this.med) * 0.08 + gauss() * 2.5, 0, 100);

    const inBurst = now < this.gammaBurstUntil;
    const base = 60000;
    const sample: EegSample = {
      attention: Math.round(this.att),
      meditation: Math.round(this.med),
      delta: base * 3 * jitter(0.5),
      theta: base * (1 + (100 - this.att) / 50) * jitter(),
      lowAlpha: base * (0.5 + this.med / 60) * jitter(),
      highAlpha: base * (0.4 + this.med / 70) * jitter(),
      lowBeta: base * (0.4 + this.att / 70) * jitter(),
      highBeta: base * (0.3 + this.att / 80) * jitter(),
      lowGamma: base * (inBurst ? 1.6 : 0.18) * jitter(),
      highGamma: base * (inBurst ? 1.1 : 0.12) * jitter(),
      signal: 0,
      battery: 80,
      ts: now,
    };
    for (const k of [
      "delta", "theta", "lowAlpha", "highAlpha",
      "lowBeta", "highBeta", "lowGamma", "highGamma",
    ] as const) {
      sample[k] = Math.round(sample[k]);
    }
    sample.spectrum = this.synthSpectrum(inBurst);
    this.handlers.onSample(sample);
  }

  /**
   * Synthetic per-Hz spectrum (1..SPECTRUM_MAX_HZ Hz) mimicking a real EEG:
   * a 1/f falloff (δ/θ dominant) plus an α bump (~10Hz, stronger when relaxed),
   * a β bump (~18Hz, stronger when focused), and a γ bump (~40Hz) during bursts.
   * Lets the spectrum chart render and respond to state in demo mode.
   */
  private synthSpectrum(inBurst: boolean): number[] {
    const bump = (hz: number, center: number, width: number) =>
      Math.exp(-((hz - center) ** 2) / (2 * width * width));
    const out: number[] = [];
    for (let hz = 1; hz <= SPECTRUM_MAX_HZ; hz++) {
      let v = 30 / hz; // 1/f falloff
      v += (0.1 + this.med / 100) * 9 * bump(hz, 10, 2); // α, relax-driven
      v += (0.1 + this.att / 100) * 5 * bump(hz, 18, 3); // β, focus-driven
      v += (inBurst ? 7 : 0.6) * bump(hz, 40, 3); // γ burst
      out.push(Math.round(v * jitter(0.12) * 100) / 100);
    }
    return out;
  }
}
