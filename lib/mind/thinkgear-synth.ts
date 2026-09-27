/**
 * 本物らしい ThinkGear のバイト列を作る（決定的：同じ seed なら同じ列）。
 *
 * 使い道は2つ：
 * - scripts/check-thinkgear.mjs：同じ列を Python（bridge/thinkgear.py）と TS
 *   （lib/mind/thinkgear.ts）に通して一致を確かめる
 * - lib/native/brainlink-web.ts：ブラウザで Android 版の画面を開発するときの
 *   「脳波計の替え玉」（そこから流れる測定は合成データとして扱われる）
 *
 * 1秒ぶん＝raw パケット（0x80、`rawRate` 個）の後に、TGAM と同じ順の大きい
 * パケット（0x02 信号 → 0x83 帯域8つ → 0x04 集中 → 0x05 リラックス）を1つ。
 * このファイルも型以外を import しない（node でそのまま動く）。
 */

/** mulberry32：小さくて決定的な擬似乱数。 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `0xAA 0xAA plen payload checksum`。 */
export function tgPacket(payload: number[]): number[] {
  let sum = 0;
  for (const b of payload) sum += b;
  return [0xaa, 0xaa, payload.length, ...payload, ~sum & 0xff];
}

/** raw 1サンプル（符号付き16bit、ビッグエンディアン）の payload。 */
export function rawPayload(value: number): number[] {
  const v = Math.max(-32768, Math.min(32767, Math.round(value))) & 0xffff;
  return [0x80, 0x02, v >> 8, v & 0xff];
}

/** 1秒に1回の大きい payload（信号・帯域8つ・集中・リラックス）。 */
export function bandPayload(signal: number, bands: number[], attention: number, meditation: number): number[] {
  const out = [0x02, signal & 0xff, 0x83, 0x18];
  for (const b of bands) {
    const v = Math.max(0, Math.min(0xffffff, Math.round(b)));
    out.push((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
  }
  out.push(0x04, attention & 0xff, 0x05, meditation & 0xff);
  return out;
}

export interface SynthOptions {
  seed?: number;
  /** 1秒あたりの raw サンプル数（実機は 512 のものと 481 のものがある）。 */
  rawRate?: number;
  /** 最初の何秒を「装着していない」（信号 200）にするか。 */
  noContactSeconds?: number;
}

/**
 * 1秒ずつバイト列を作る。raw は α（10Hz）・β（18Hz）・γ（40Hz）の正弦に
 * ゆっくりした電極のドリフトと雑音を足したもの（ADC の数値で数百程度）。
 */
export class ThinkGearSynth {
  private rng: () => number;
  private rawRate: number;
  private noContact: number;
  private second = 0;
  private sampleIndex = 0;
  private attention = 50;
  private meditation = 50;

  constructor(options: SynthOptions = {}) {
    this.rng = makeRng(options.seed ?? 1);
    this.rawRate = options.rawRate ?? 512;
    this.noContact = options.noContactSeconds ?? 0;
  }

  setRawRate(rate: number): void {
    this.rawRate = rate;
  }

  /** 次の1秒ぶんのバイト列。 */
  nextSecond(): Uint8Array {
    const bytes: number[] = [];
    const rate = this.rawRate;
    for (let k = 0; k < rate; k++) {
      // 周波数は「本物の時間」で決める——rawRate が 481 の装置でも、脳波の 10Hz は 10Hz。
      const t = this.sampleIndex / 512;
      this.sampleIndex += 512 / rate;
      const value =
        120 * Math.sin(2 * Math.PI * 10 * t) +
        45 * Math.sin(2 * Math.PI * 18 * t + 1.3) +
        18 * Math.sin(2 * Math.PI * 40 * t + 0.4) +
        60 * Math.sin(2 * Math.PI * 0.07 * t) +
        (this.rng() - 0.5) * 80;
      bytes.push(...tgPacket(rawPayload(value)));
    }

    this.attention = clamp(this.attention + (this.rng() - 0.5) * 16, 5, 95);
    this.meditation = clamp(this.meditation + (this.rng() - 0.5) * 16, 5, 95);
    const jitter = () => 0.7 + this.rng() * 0.6;
    const bands = [
      520000 * jitter(),
      150000 * jitter(),
      42000 * jitter(),
      31000 * jitter(),
      21000 * jitter(),
      15000 * jitter(),
      8000 * jitter(),
      4200 * jitter(),
    ];
    const signal = this.second < this.noContact ? 200 : 0;
    bytes.push(
      ...tgPacket(bandPayload(signal, bands, Math.round(this.attention), Math.round(this.meditation)))
    );
    this.second += 1;
    return Uint8Array.from(bytes);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
