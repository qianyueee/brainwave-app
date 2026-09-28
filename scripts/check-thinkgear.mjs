/**
 * ThinkGear パーサの突き合わせ：bridge/thinkgear.py（PC ブリッジ）と
 * lib/mind/thinkgear.ts（Android アプリ）に同じバイト列を同じ切れ目で通し、
 * 出てくる EegSample が一致することを確かめる（`pnpm check:thinkgear`）。
 *
 * 両者は同じ装置から同じ測定を作る約束なので、どちらかを直したらこれを通す。
 * - スペクトル以外は完全一致（ts も：Python の time.time を差し替えて同じ時刻を渡す）
 * - スペクトルは差 0.001 以内（cos/sin/hypot の最下位ビットが Python の libm と
 *   V8 で違うことがあり、3桁に丸めた境目でまれに1つずれる）。一致率も出す
 * - TS だけで：同じバイト列をどの位置で2つに切って渡しても結果が変わらないこと
 *
 * 要 python3（PYTHON で差し替え可）。node 22 は .ts をそのまま import できる。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ThinkGearParser } from "../lib/mind/thinkgear.ts";
import { ThinkGearSynth, makeRng, tgPacket, rawPayload, bandPayload } from "../lib/mind/thinkgear-synth.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = process.env.PYTHON || "python3";
const T0 = 1_760_000_000_000;

// ── バイト列を作る ──

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function stream(seconds, { seed, rate = 512, noContactSeconds = 0, rates = null }) {
  const synth = new ThinkGearSynth({ seed, rawRate: rate, noContactSeconds });
  const parts = [];
  for (let s = 0; s < seconds; s++) {
    if (rates) synth.setRawRate(rates(s));
    parts.push(synth.nextSecond());
  }
  return concat(parts);
}

/** 実機で起きうる乱れを混ぜた列。 */
function hostileStream(seconds, seed) {
  const rng = makeRng(seed);
  const synth = new ThinkGearSynth({ seed: seed + 1, rawRate: 512, noContactSeconds: 2 });
  const bands = [400000, 120000, 40000, 30000, 20000, 15000, 7000, 3000];
  const oddities = [
    () => tgPacket(rawPayload(-21846)), // raw の中に AA AA（0xAAAA）
    () => tgPacket(rawPayload(-21931)), // AA 55
    () => [0xaa, 0xaa, 0xaa], // AA AA AA：plen 0xAA として読まれ捨てられる
    () => [0xaa, 0xaa, 0x00, 0xff], // 空の payload
    () => [0xaa, 0xaa, 0xc8, 1, 2, 3], // plen > 169
    () => tgPacket([0x55, 0x55, 0x03, 0x10]), // excode ＋ 未知の1バイト行
    () => tgPacket([0x03, 0x42, 0x86, 0x02, 0x01, 0x02]), // 未知の行（1バイト・長さ付き）
    () => tgPacket([0x80, 0x03, 0x01, 0x02, 0x03]), // raw なのに長さ 3
    () => tgPacket([0x83, 0x14, ...new Array(20).fill(7)]), // 帯域なのに長さ 20
    () => tgPacket([0x80, 0x05, 0x01, 0x02]), // 長さが payload を越える（trunc）
    () => tgPacket([0x04, 0x33, 0x55]), // excode で終わる（trunc）
    () => {
      // 集中・リラックスが帯域より前に来る並び
      const p = bandPayload(0, bands, 61, 44);
      return tgPacket([...p.slice(28), ...p.slice(0, 28)]);
    },
    () => tgPacket([...bandPayload(0, bands, 70, 30), 0x83, 0x18, ...new Array(24).fill(9)]), // 帯域行が2つ（後ろが勝つ）
    () => {
      // 校験の壊れた帯域パケット
      const pkt = tgPacket(bandPayload(0, bands, 50, 50));
      pkt[pkt.length - 1] ^= 0x5a;
      return pkt;
    },
  ];

  const parts = [Uint8Array.from({ length: 37 }, () => Math.floor(rng() * 256))]; // 先頭のごみ
  for (let s = 0; s < seconds; s++) {
    let sec = Array.from(synth.nextSecond());
    // 1%ほどのパケットの校験を壊す／たまに1バイト落とす（Bluetooth の取りこぼし）
    const out = [];
    for (let i = 0; i < sec.length; i++) {
      if (rng() < 1 / 3000) continue;
      out.push(sec[i]);
    }
    sec = out;
    for (let k = 0; k < 4; k++) {
      const at = Math.floor(rng() * sec.length);
      const odd = oddities[Math.floor(rng() * oddities.length)]();
      sec.splice(at, 0, ...odd);
    }
    if (rng() < 0.4) {
      const at = Math.floor(rng() * sec.length);
      sec[at] = sec[at] ^ 0x11;
    }
    parts.push(Uint8Array.from(sec));
  }
  return concat(parts);
}

// ── 切れ目 ──

function chunked(bytes, sizes) {
  const chunks = [];
  let at = 0;
  let i = 0;
  while (at < bytes.length) {
    const n = sizes(i);
    chunks.push({ bytes: bytes.subarray(at, at + n), t: T0 + i * 37 });
    at += n;
    i += 1;
  }
  return chunks;
}

const fixed = (n) => () => n;
const random = (seed, max) => {
  const rng = makeRng(seed);
  return () => 1 + Math.floor(rng() * max);
};

// ── 実行 ──

function runTs(chunks) {
  const parser = new ThinkGearParser();
  const out = [];
  for (const c of chunks) out.push(...parser.feed(c.bytes, c.t));
  return out;
}

const HARNESS = String.raw`
import sys, json, base64
sys.path.insert(0, sys.argv[1])
import thinkgear

class Clock:
    now = 0.0
    def time(self):
        return self.now

clock = Clock()
thinkgear.time = clock
runs = json.load(sys.stdin)
out = []
for chunks in runs:
    parser = thinkgear.ThinkGearParser()
    samples = []
    for b64, t in chunks:
        clock.now = (t + 0.5) / 1000.0
        samples.extend(parser.feed(base64.b64decode(b64)))
    out.append(samples)
json.dump(out, sys.stdout)
`;

function runPython(runs) {
  const input = JSON.stringify(
    runs.map((chunks) => chunks.map((c) => [Buffer.from(c.bytes).toString("base64"), c.t]))
  );
  const res = spawnSync(PYTHON, ["-c", HARNESS, path.join(root, "bridge")], {
    input,
    maxBuffer: 1 << 30,
    encoding: "utf8",
  });
  if (res.status !== 0) {
    console.error(res.stderr || res.error);
    process.exit(1);
  }
  return JSON.parse(res.stdout);
}

let failures = 0;
let specValues = 0;
let specExact = 0;
let specMaxDiff = 0;

function fail(msg) {
  failures += 1;
  if (failures <= 20) console.error(`  ✗ ${msg}`);
}

function compare(label, py, ts) {
  if (py.length !== ts.length) {
    fail(`${label}: サンプル数 Python=${py.length} TS=${ts.length}`);
    return;
  }
  for (let i = 0; i < py.length; i++) {
    const a = py[i];
    const b = ts[i];
    const ka = Object.keys(a).sort().join(",");
    const kb = Object.keys(b).sort().join(",");
    if (ka !== kb) {
      fail(`${label} #${i}: 項目が違う Python=[${ka}] TS=[${kb}]`);
      continue;
    }
    for (const k of Object.keys(a)) {
      if (k === "spectrum") {
        if (a[k].length !== b[k].length) {
          fail(`${label} #${i}: spectrum の長さ ${a[k].length} / ${b[k].length}`);
          continue;
        }
        for (let j = 0; j < a[k].length; j++) {
          const d = Math.abs(a[k][j] - b[k][j]);
          specValues += 1;
          if (d === 0) specExact += 1;
          specMaxDiff = Math.max(specMaxDiff, d);
          if (d > 0.001 + 1e-9) fail(`${label} #${i}: spectrum[${j}] Python=${a[k][j]} TS=${b[k][j]}`);
        }
      } else if (a[k] !== b[k]) {
        fail(`${label} #${i}: ${k} Python=${JSON.stringify(a[k])} TS=${JSON.stringify(b[k])}`);
      }
    }
  }
}

const scenarios = [
  { name: "512Hz", bytes: stream(40, { seed: 11 }), chunkings: ["whole", "random"] },
  { name: "481Hz", bytes: stream(40, { seed: 12, rate: 481, noContactSeconds: 3 }), chunkings: ["whole", "random"] },
  {
    // 実測率は直近15秒の中央値なので、範囲外（256未満・560超）が半分を超えて
    // 続いたときだけ specRate / spectrum が消える。各区間を15秒にしてそこまで通す。
    name: "率の切り替え（512→481→200→600→512）",
    bytes: stream(75, {
      seed: 13,
      rates: (s) => (s < 15 ? 512 : s < 30 ? 481 : s < 45 ? 200 : s < 60 ? 600 : 512),
    }),
    chunkings: ["whole", "random"],
  },
  {
    name: "乱れた列",
    bytes: hostileStream(40, 14),
    chunkings: ["whole", 1, 2, 3, 7, 64, 173, 1000, 4096, "random"],
  },
];

const runs = [];
for (const sc of scenarios) {
  for (const ck of sc.chunkings) {
    const sizes = ck === "whole" ? fixed(sc.bytes.length) : ck === "random" ? random(sc.bytes.length, 300) : fixed(ck);
    runs.push({ label: `${sc.name} / ${ck === "whole" ? "一括" : ck === "random" ? "ランダム" : `${ck}B`}`, chunks: chunked(sc.bytes, sizes) });
  }
}

console.log(`check-thinkgear: ${runs.length} 通りを Python と TS に通します…`);
const pyResults = runPython(runs.map((r) => r.chunks));
let samples = 0;
const tsResults = runs.map((r, i) => {
  const ts = runTs(r.chunks);
  samples += ts.length;
  compare(r.label, pyResults[i], ts);
  return ts;
});

// 一致していても、比べた中身が空では意味がない：通るべき道を通ったかを確かめる。
const seen = (pred) => tsResults.some((list) => list.some(pred));
const expectations = [
  ["スペクトル付きのサンプル", (s) => Array.isArray(s.spectrum) && s.spectrum.length === 64],
  ["481Hz で組んだスペクトル", (s) => s.specRate === 481 && Array.isArray(s.spectrum)],
  ["実測率が範囲外で specRate なし", (s) => s.rawPerSec === 200 && s.specRate === undefined],
  ["装着なし（signal 200）", (s) => s.signal === 200],
  ["校験の失敗（chk）", (s) => /chk:\d/.test(s.parseErr)],
  ["長さの異常（plen）", (s) => /plen:\d/.test(s.parseErr)],
  ["途切れた行（trunc）", (s) => /trunc:\d/.test(s.parseErr)],
  ["読み飛ばした行（excode / 未知の行 / 長さ違いの raw）", (s) => /excode/.test(s.skipRows) && /80\/3/.test(s.skipRows)],
];
for (const [what, pred] of expectations) {
  if (!seen(pred)) fail(`検査の列に「${what}」が出てこない（検査が空回りしている）`);
}

// TS だけ：どこで2つに切っても同じ結果（受信の切れ目に依らない）。
const segment = hostileStream(3, 99);
const whole = JSON.stringify(runTs([{ bytes: segment, t: T0 }]));
for (let cut = 1; cut < segment.length; cut++) {
  const split = JSON.stringify(
    runTs([
      { bytes: segment.subarray(0, cut), t: T0 },
      { bytes: segment.subarray(cut), t: T0 },
    ])
  );
  if (split !== whole) {
    fail(`切れ目 ${cut} バイト目で結果が変わった`);
    break;
  }
}

const rate = specValues ? ((specExact / specValues) * 100).toFixed(3) : "0";
console.log(
  `check-thinkgear: サンプル ${samples} 件、スペクトル ${specValues} 値（完全一致 ${rate}%、最大差 ${specMaxDiff}）、切れ目 ${segment.length - 1} 通り`
);
if (failures > 0) {
  console.error(`check-thinkgear: ✗ ${failures} 件の不一致`);
  process.exit(1);
}
console.log("check-thinkgear: ✓ Python と一致");
