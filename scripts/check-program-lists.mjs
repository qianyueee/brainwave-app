/**
 * プログラム一覧（docs/program-lists/*.xlsx）と、アプリが鳴らす周波数の突き合わせ。
 *
 *   pnpm check:programs
 *
 * - Target・Energy・Morning Tuning：一覧の1行ごとに lib/catalog/program-list.ts の
 *   写しを名前で探し、
 *     1) 原文（周波数・脳波誘導波の欄）が写しと同じか——違えば一覧が更新されたので、
 *        写しと鳴らし方を見直す。
 *     2) 写しの数値（キャリア・ビート）が原文の数値と合っているか——写し間違いを捕まえる。
 *        provisional・note のある行（一覧どおりに鳴らさない理由を書いた行）だけは
 *        食い違っても止めずに表示する。
 *   一覧にあって写しに無い行・写しにあって一覧に無い行も止める。
 * - Astro：一覧の各行（星座 × ビート）が星座マスタ（lib/zodiac.ts）のキャリアと、
 *   鳴らせるビート（MODULAR_BEATS と自星座のビート）にあるか。
 *
 * node 22 は .ts をそのまま import できる（check-records.mjs と同じ）。program-list.ts と
 * zodiac.ts はどちらも値の import を持たないので、そのまま読める。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { PROGRAM_LIST } from "../lib/catalog/program-list.ts";
import { MODULAR_BEATS, ZODIAC_SIGNS } from "../lib/zodiac.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(root, "docs", "program-lists");
const LISTED_FILES = [
  "Targetプログラム一覧.xlsx",
  "Energyプログラム一覧.xlsx",
  "Morning Tuning & Energizeプログラム.xlsx",
];
const ASTRO_FILE = "Astroプログラム一覧.xlsx";

const errors = [];
const notes = [];

/** 空白（全角・改行を含む）を1つに詰める。program-list.ts の原文も同じ形で書いてある。 */
const squash = (v) => String(v ?? "").replace(/[\s　]+/g, " ").trim();

/** 文中の数値を順に。 */
function numbersIn(text) {
  return (String(text).normalize("NFKC").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function planNumbers(plan) {
  switch (plan.kind) {
    case "steady":
      return [plan.hz];
    case "layered":
      return [plan.hz, plan.extra];
    case "sweep":
      return [plan.from, plan.to];
    case "wave":
      return [plan.lo, plan.hi];
    case "path":
      return plan.keys.map(([, hz]) => hz);
    default:
      return [];
  }
}

const sameSet = (a, b) => {
  const u = (xs) => [...new Set(xs)].sort((x, y) => x - y);
  const [ua, ub] = [u(a), u(b)];
  return ua.length === ub.length && ua.every((v, i) => Math.abs(v - ub[i]) < 1e-9);
};

/** 1枚目のシートを、見出し（1行目）の名前で引ける行の配列にする。 */
function readRows(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    blankrows: false,
    defval: "",
  });
  const head = (aoa[0] ?? []).map(squash);
  const col = (name) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`${path.basename(file)}: 見出し「${name}」が無い（${head.filter(Boolean).join(" / ")}）`);
    return i;
  };
  const [iName, iCarrier, iBeat] = [col("プログラム名"), col("周波数"), col("脳波誘導波")];
  const iTag = head.indexOf("Tags");
  return aoa
    .slice(1)
    .map((r) => ({
      name: squash(r[iName]),
      carrierText: squash(r[iCarrier]),
      beatText: squash(r[iBeat]),
      tag: iTag >= 0 ? squash(r[iTag]) : "",
    }))
    .filter((r) => r.name);
}

// ─── Target・Energy・Morning Tuning ─────────────────────────────────────────

const byName = new Map(Object.entries(PROGRAM_LIST).map(([id, e]) => [squash(e.listName), { id, e }]));
const matched = new Set();
const counts = {};

for (const fileName of LISTED_FILES) {
  const rows = readRows(path.join(DIR, fileName));
  counts[fileName] = rows.length;
  for (const row of rows) {
    const hit = byName.get(row.name);
    if (!hit) {
      errors.push(`${fileName}:「${row.name}」が lib/catalog/program-list.ts に無い`);
      continue;
    }
    const { id, e } = hit;
    matched.add(id);
    if (e.carrierText !== row.carrierText || e.beatText !== row.beatText) {
      errors.push(
        `${id}: 一覧の原文が写しと違う（一覧が更新された？）\n` +
          `      一覧: 周波数「${row.carrierText}」脳波誘導波「${row.beatText}」\n` +
          `      写し: 周波数「${e.carrierText}」脳波誘導波「${e.beatText}」`
      );
      continue;
    }
    const explained = e.provisional || e.note;
    if (!numbersIn(row.carrierText).some((n) => Math.abs(n - e.carrier) < 1e-9)) {
      (explained ? notes : errors).push(`${id}: キャリア ${e.carrier}Hz が一覧「${row.carrierText}」に無い${e.note ? `——${e.note}` : ""}`);
    }
    const listedBeats = numbersIn(row.beatText);
    const playedBeats = planNumbers(e.beat);
    if (!sameSet(listedBeats, playedBeats)) {
      const msg = `${id}: 一覧「${row.beatText || "（空欄）"}」→ 鳴らすビート ${[...new Set(playedBeats)].join("・")}Hz${e.provisional ? "（暫定）" : ""}`;
      if (explained) notes.push(`${msg}——${e.note ?? ""}`);
      else errors.push(`${msg}——数値が合わない（写し間違い？）`);
    }
  }
}

for (const id of Object.keys(PROGRAM_LIST)) {
  if (!matched.has(id)) errors.push(`${id}: 写しにあるが、どの一覧にも同じ名前の行が無い`);
}

// ─── Astro ─────────────────────────────────────────────────────────────────

const astroRows = readRows(path.join(DIR, ASTRO_FILE));
const perSign = new Map();
for (const row of astroRows) {
  const sign = ZODIAC_SIGNS.find((s) => s.nameJa === row.tag);
  if (!sign) {
    errors.push(`${ASTRO_FILE}:「${row.name}」の星座「${row.tag}」が星座マスタに無い`);
    continue;
  }
  const [carrier] = numbersIn(row.carrierText);
  const [beat] = numbersIn(row.beatText);
  if (carrier !== sign.carrierFreq) {
    errors.push(`${row.name}: キャリア ${carrier}Hz が星座マスタ（${sign.carrierFreq}Hz）と違う`);
  }
  const playable = [...MODULAR_BEATS, sign.targetBeatFreq];
  if (!playable.includes(beat)) {
    errors.push(`${row.name}: ビート ${beat}Hz の節目が無い（MODULAR_BEATS・自星座のビートの外）`);
  }
  // ファイル名の末尾（_20Hz）と「脳波誘導波」欄が同じ節目を指しているか。
  if (!row.name.endsWith(`_${row.beatText}`)) {
    errors.push(`${row.name}: 名前の末尾が脳波誘導波「${row.beatText}」と合わない`);
  }
  perSign.set(sign.key, (perSign.get(sign.key) ?? 0) + 1);
}
if (perSign.size !== ZODIAC_SIGNS.length) {
  errors.push(`${ASTRO_FILE}: 載っている星座が ${perSign.size}/${ZODIAC_SIGNS.length}`);
}

// ─── 結果 ───────────────────────────────────────────────────────────────────

for (const n of notes) console.log(`  注記  ${n}`);
if (errors.length) {
  console.error(`\ncheck:programs ✗ ${errors.length} 件:\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}
const summary = [
  ...LISTED_FILES.map((f) => `${f.replace(/\.xlsx$/, "")} ${counts[f]}`),
  `${ASTRO_FILE.replace(/\.xlsx$/, "")} ${astroRows.length}`,
].join("・");
console.log(`check:programs OK（${summary}、注記 ${notes.length} 件）`);
