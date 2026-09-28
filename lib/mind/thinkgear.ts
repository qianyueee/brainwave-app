/**
 * ThinkGear（BrainLink Pro / TGAM）のバイト列 → EegSample。
 *
 * **bridge/thinkgear.py の1行ずつの移植**。PC ブリッジ（Python）と Android アプリ
 * （Bluetooth を直接読む、lib/mind/bluetooth-link.ts）が同じ装置から同じ EegSample
 * を作るためのもので、どちらかを直したら必ずもう片方も直す。一致は
 * scripts/check-thinkgear.mjs が同じバイト列を両方に通して確かめる
 * （`pnpm check:thinkgear`）。アルゴリズムの理由（校験失敗で同期対だけを捨てる、
 * payload を最後まで読んでから組み立てる、実測レートで周波数軸を作る、直線を
 * 引いてから窓を掛ける…）は Python 側のコメントに書いてある。
 *
 * このファイルは型以外を import しない——node でそのまま実行できる（上の検査が
 * そうしている。lib/sync-tree.ts と同じ約束）。型の import は宣言ごと
 * `import type` で書くこと（`import { type X }` は node の型除去で残る）。
 *
 * Python と違うのは「今の時刻」の取り方だけ：Python はパースした瞬間の
 * time.time()、こちらは feed() に渡された時刻（ネイティブ側が受信した時刻）を
 * そのまま ts にする。
 */
import type { EegSample } from "./types";

const SYNC = 0xaa;
const EXCODE = 0x55;
const MAX_PLEN = 169;

const CODE_POOR_SIGNAL = 0x02;
const CODE_ATTENTION = 0x04;
const CODE_MEDITATION = 0x05;
const CODE_RAW = 0x80;
const CODE_ASIC_EEG_POWER = 0x83;

export const SPECTRUM_MAX_HZ = 64;
const FFT_WINDOW = 512;
const RATE_MIN = 256;
const RATE_MAX = 560;
const RATE_HISTORY = 15;
const RATE_MIN_SAMPLES = 5;
const BASIS_CACHE_MAX = 4;

// 窓の中心を0にした直線（最小二乗の傾きの分母がその二乗和）。
const RAMP = new Float64Array(FFT_WINDOW);
let RAMP_SS = 0;
for (let n = 0; n < FFT_WINDOW; n++) {
  RAMP[n] = n - (FFT_WINDOW - 1) / 2;
  RAMP_SS += RAMP[n] * RAMP[n];
}

interface Basis {
  hann: Float64Array;
  cos: Float64Array[];
  sin: Float64Array[];
}
const basisCache = new Map<number, Basis>();

function basis(rate: number): Basis {
  const cached = basisCache.get(rate);
  if (cached) return cached;
  if (basisCache.size >= BASIS_CACHE_MAX) basisCache.clear();
  const w = FFT_WINDOW;
  const hann = new Float64Array(w);
  for (let n = 0; n < w; n++) hann[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (w - 1));
  const cos: Float64Array[] = [];
  const sin: Float64Array[] = [];
  for (let f = 1; f <= SPECTRUM_MAX_HZ; f++) {
    const wf = (2 * Math.PI * f) / rate;
    const c = new Float64Array(w);
    const s = new Float64Array(w);
    for (let n = 0; n < w; n++) {
      c[n] = Math.cos(wf * n);
      s[n] = Math.sin(wf * n);
    }
    cos.push(c);
    sin.push(s);
  }
  const made = { hann, cos, sin };
  basisCache.set(rate, made);
  return made;
}

/**
 * Python の round(x, 3)（正しく丸めた10進、ちょうど真ん中は偶数へ）。
 * toFixed も厳密値で丸めるが、真ん中は大きい方へ寄せる。3桁でちょうど真ん中に
 * なる倍精度数は x×16 が奇数の整数のときだけ（x = 奇数/16）なので、そこだけ直す。
 */
export function pyRound3(x: number): number {
  const x16 = x * 16;
  if (Number.isInteger(x16) && Math.abs(x16) % 2 === 1) {
    const lower = Math.floor(x * 1000);
    return (lower % 2 === 0 ? lower : lower + 1) / 1000;
  }
  return Number(x.toFixed(3));
}

/** 直近 FFT_WINDOW 個の raw（古い順）から 1..SPECTRUM_MAX_HZ Hz の振幅。 */
function spectrum(raw: Float64Array, rate: number): number[] {
  const x = raw;
  let sum = 0;
  for (let n = 0; n < FFT_WINDOW; n++) sum += x[n];
  const mean = sum / FFT_WINDOW;
  let slopeNum = 0;
  for (let n = 0; n < FFT_WINDOW; n++) slopeNum += RAMP[n] * x[n];
  const slope = slopeNum / RAMP_SS;
  const { hann, cos, sin } = basis(rate);
  const win = new Float64Array(FFT_WINDOW);
  for (let n = 0; n < FFT_WINDOW; n++) win[n] = (x[n] - mean - slope * RAMP[n]) * hann[n];
  const out: number[] = [];
  for (let f = 0; f < SPECTRUM_MAX_HZ; f++) {
    const cf = cos[f];
    const sf = sin[f];
    let re = 0;
    let im = 0;
    for (let n = 0; n < FFT_WINDOW; n++) {
      const v = win[n];
      re += v * cf[n];
      im += v * sf[n];
    }
    out.push(pyRound3(Math.hypot(re, im) / FFT_WINDOW));
  }
  return out;
}

/** `key:count;key:count`（0 は省く、キーは文字列順）。Python の _fmt_counts。 */
function fmtCounts(counts: Record<string, number>): string {
  return Object.keys(counts)
    .sort()
    .filter((k) => counts[k])
    .map((k) => `${k}:${counts[k]}`)
    .join(";");
}

const hex2 = (n: number): string => n.toString(16).padStart(2, "0");

export class ThinkGearParser {
  // 受信バッファ（buf[head..tail)）。Python の bytearray に当たる。
  private buf = new Uint8Array(4096);
  private head = 0;
  private tail = 0;

  private signal = 200;
  private attention = 0;
  private meditation = 0;
  // raw の輪（deque(maxlen=512)）。
  private raw = new Int16Array(FFT_WINDOW);
  private rawStart = 0;
  private rawCount = 0;
  private rawSinceBands = 0;
  private rateHist: number[] = [];
  private skipped: Record<string, number> = {};
  private parseErr: Record<string, number> = { chk: 0, trunc: 0, plen: 0 };

  /** 受け取ったバイトを食べ、出来上がった EegSample を返す（`nowMs` がその ts）。 */
  feed(data: Uint8Array, nowMs: number): EegSample[] {
    this.push(data);
    const samples: EegSample[] = [];

    for (;;) {
      const start = this.findSync();
      if (start < 0) {
        // 同期対が無い：最後の1バイトだけ残す（次の SYNC の片割れかもしれない）。
        if (this.length() > 1) this.head = this.tail - 1;
        break;
      }
      this.head += start;
      if (this.length() < 3) break;

      const plen = this.at(2);
      if (plen > MAX_PLEN) {
        this.parseErr.plen += 1;
        this.head += 2;
        continue;
      }
      if (this.length() < 3 + plen + 1) break;

      let sum = 0;
      for (let i = 0; i < plen; i++) sum += this.at(3 + i);
      if ((~sum & 0xff) !== this.at(3 + plen)) {
        // 校験が合わない＝そもそも包ではない。同期対だけ捨てて探し直す。
        this.parseErr.chk += 1;
        this.head += 2;
        continue;
      }
      const payload = this.buf.slice(this.head + 3, this.head + 3 + plen);
      this.head += 3 + plen + 1;

      const sample = this.parsePayload(payload, nowMs);
      if (sample) samples.push(sample);
    }

    this.compact();
    return samples;
  }

  private parsePayload(payload: Uint8Array, nowMs: number): EegSample | null {
    let bands: number[] | null = null;
    let i = 0;
    const n = payload.length;
    while (i < n) {
      while (i < n && payload[i] === EXCODE) {
        this.skip("excode");
        i += 1;
      }
      if (i >= n) {
        this.parseErr.trunc += 1;
        break;
      }
      const code = payload[i];
      i += 1;
      if (code < 0x80) {
        if (i >= n) {
          this.parseErr.trunc += 1;
          break;
        }
        const value = payload[i];
        i += 1;
        if (code === CODE_POOR_SIGNAL) this.signal = value;
        else if (code === CODE_ATTENTION) this.attention = value;
        else if (code === CODE_MEDITATION) this.meditation = value;
        else this.skip(hex2(code));
      } else {
        if (i >= n) {
          this.parseErr.trunc += 1;
          break;
        }
        const vlen = payload[i];
        i += 1;
        if (i + vlen > n) {
          this.parseErr.trunc += 1;
          break;
        }
        const at = i;
        i += vlen;
        if (code === CODE_RAW && vlen === 2) {
          // 符号付き 16bit ビッグエンディアン（約 512Hz の raw 波形）。
          const v = (payload[at] << 8) | payload[at + 1];
          this.pushRaw(v >= 0x8000 ? v - 0x10000 : v);
          this.rawSinceBands += 1;
        } else if (code === CODE_ASIC_EEG_POWER && vlen === 24) {
          bands = [];
          for (let j = 0; j < 24; j += 3) {
            bands.push(payload[at + j] * 65536 + payload[at + j + 1] * 256 + payload[at + j + 2]);
          }
        } else {
          this.skip(`${hex2(code)}/${vlen}`);
        }
      }
    }

    if (bands === null) return null;
    // 帯域は TGAM の並び（delta, theta, lowAlpha, highAlpha, lowBeta, highBeta,
    // lowGamma, highGamma）。TGAM の "mid gamma" が highGamma。
    const sample: EegSample = {
      attention: this.attention,
      meditation: this.meditation,
      delta: bands[0],
      theta: bands[1],
      lowAlpha: bands[2],
      highAlpha: bands[3],
      lowBeta: bands[4],
      highBeta: bands[5],
      lowGamma: bands[6],
      highGamma: bands[7],
      signal: this.signal,
      rawPerSec: this.rawSinceBands,
      skipRows: fmtCounts(this.skipped),
      parseErr: fmtCounts(this.parseErr),
      ts: nowMs,
    };
    this.rateHist.push(this.rawSinceBands);
    if (this.rateHist.length > RATE_HISTORY) this.rateHist.shift();
    this.rawSinceBands = 0;
    this.skipped = {};
    this.parseErr = { chk: 0, trunc: 0, plen: 0 };

    const rate = this.effectiveRate();
    if (rate !== null) {
      sample.specRate = rate;
      if (this.rawCount >= FFT_WINDOW) sample.spectrum = spectrum(this.rawInOrder(), rate);
    }
    return sample;
  }

  /** 実測の raw 率（直近 RATE_HISTORY 秒の上中央値）。少なすぎる・範囲外は null。 */
  private effectiveRate(): number | null {
    if (this.rateHist.length < RATE_MIN_SAMPLES) return null;
    const ordered = [...this.rateHist].sort((a, b) => a - b);
    const rate = ordered[Math.floor(ordered.length / 2)];
    return rate >= RATE_MIN && rate <= RATE_MAX ? rate : null;
  }

  private skip(key: string): void {
    this.skipped[key] = (this.skipped[key] ?? 0) + 1;
  }

  private pushRaw(v: number): void {
    if (this.rawCount < FFT_WINDOW) {
      this.raw[(this.rawStart + this.rawCount) % FFT_WINDOW] = v;
      this.rawCount += 1;
    } else {
      this.raw[this.rawStart] = v;
      this.rawStart = (this.rawStart + 1) % FFT_WINDOW;
    }
  }

  private rawInOrder(): Float64Array {
    const x = new Float64Array(FFT_WINDOW);
    for (let k = 0; k < FFT_WINDOW; k++) x[k] = this.raw[(this.rawStart + k) % FFT_WINDOW];
    return x;
  }

  // ── 受信バッファ ──

  private length(): number {
    return this.tail - this.head;
  }

  private at(offset: number): number {
    return this.buf[this.head + offset];
  }

  private findSync(): number {
    for (let p = this.head; p + 1 < this.tail; p++) {
      if (this.buf[p] === SYNC && this.buf[p + 1] === SYNC) return p - this.head;
    }
    return -1;
  }

  private push(data: Uint8Array): void {
    if (this.tail + data.length > this.buf.length) {
      this.compact();
      if (this.tail + data.length > this.buf.length) {
        const grown = new Uint8Array(Math.max(this.buf.length * 2, this.tail + data.length));
        grown.set(this.buf.subarray(0, this.tail));
        this.buf = grown;
      }
    }
    this.buf.set(data, this.tail);
    this.tail += data.length;
  }

  private compact(): void {
    if (this.head === 0) return;
    this.buf.copyWithin(0, this.head, this.tail);
    this.tail -= this.head;
    this.head = 0;
  }
}
