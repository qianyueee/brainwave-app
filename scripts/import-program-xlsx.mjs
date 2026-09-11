/**
 * 一覧 xlsx（Targetプログラム一覧.xlsx など）から、カタログ節目の周波数を
 * 取り込む。
 *
 * 出力するのは **数値だけ** を持つ lib/catalog/params.generated.ts で、
 * lib/catalog/{target,energy}.ts 本体は書き換えない。名前・よみ・アイコン・
 * 小分類の並びは人が決めたものなので、取り込みのたびに消えては困る——
 * xlsx が持っているのは載波・差周波・尺であって、そこだけを受け取る。
 * 生成ファイルに id が載った節目は paramsProvisional が自動で外れる。
 *
 * 使い方:
 *   node scripts/import-program-xlsx.mjs --inspect <file.xlsx>
 *       シート名・見出し・先頭3行と、見出しがどの項目に対応したかを出すだけ。
 *       まだ実物の列名を見ていないので、**必ずこれを先に走らせて**
 *       HEADER_SYNONYMS を実物に合わせてから取り込むこと。
 *
 *   node scripts/import-program-xlsx.mjs --in <file.xlsx> [--dry-run]
 *       既存カタログの節目と名前で突き合わせて params.generated.ts を書く。
 *       どちらか片方にしか無いものは黙って捨てず、必ず一覧で報告する。
 *
 * 照合は名前（日本語 or 英語原題）で行う。id は英語原題から人が付けたもので
 * xlsx には載っていないため。id は localStorage に残る利用者の選択そのもの
 * （useAppStore.selectedProgramId）なので、機械に振り直させない。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "lib", "catalog", "params.generated.ts");

/**
 * 見出しの揺れを吸収する表。実物を --inspect で見たら、ここに1行足すだけで
 * 対応できるようにまとめてある。
 */
const HEADER_SYNONYMS = {
  name: ["プログラム名", "名称", "タイトル", "曲名", "name", "title"],
  titleEn: ["英語名", "英題", "englishtitle", "nameen", "titleen"],
  subGenre: ["ジャンル", "サブジャンル", "カテゴリ", "分類", "genre", "category"],
  carrierFreq: ["キャリア", "載波", "キャリア周波数", "基音", "ベース周波数", "carrier", "carrierhz"],
  targetBeatFreq: ["差周波", "差分周波数", "ビート", "ビート周波数", "目標周波数", "beat", "targetbeat"],
  durationMin: ["長さ", "時間", "尺", "分", "duration", "minutes"],
};

/**
 * 見出しの正規化。全角/半角・大小・括弧・記号の違いだけを畳む。
 *
 * 単位（Hz・分）は **落とさない**。落とすと同義語側の "分" が空文字になり、
 * `includes("")` が常に真になって無関係な見出し（"効果" など）まで
 * durationMin に吸い込まれる。単位は付いたままでも includes で当たる
 * （"長さ（分）" → "長さ分" は "長さ" を含む）。
 */
function normHeader(h) {
  return String(h ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-()（）[\]【】:：/／]/g, "");
}

/** 名前の正規化。突き合わせ用（lib/catalog/search.ts と同じ考え方）。 */
function normName(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[ \t　・･ー,，、。．.＆&+()（）[\]「」『』【】〜~/／|:：;；'"’”-]/g, "");
}

function mapHeaders(headerRow) {
  const mapped = {};
  const unmapped = [];
  headerRow.forEach((raw, i) => {
    if (raw === undefined || raw === "") return;
    const n = normHeader(raw);
    const hit = Object.entries(HEADER_SYNONYMS).find(([, syns]) =>
      syns.some((s) => {
        const ns = normHeader(s);
        return ns !== "" && (n === ns || n.includes(ns));
      })
    );
    if (hit) mapped[hit[0]] = { index: i, raw: String(raw) };
    else unmapped.push({ index: i, raw: String(raw) });
  });
  return { mapped, unmapped };
}

/** 見出し行は必ずしも1行目ではない（表題や空行が上に載ることがある）。 */
function findHeaderRow(aoa) {
  let best = { row: 0, score: -1, mapped: {}, unmapped: [] };
  for (let r = 0; r < Math.min(aoa.length, 10); r++) {
    const { mapped, unmapped } = mapHeaders(aoa[r] ?? []);
    const score = Object.keys(mapped).length;
    if (score > best.score) best = { row: r, score, mapped, unmapped };
  }
  return best;
}

function readSheet(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  return { wb, sheets: wb.SheetNames };
}

function toNumber(v) {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(String(v).normalize("NFKC").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function inspect(file) {
  const { wb, sheets } = readSheet(file);
  console.log(`\n${path.relative(root, file)}`);
  console.log(`  sheets: ${JSON.stringify(sheets)}`);
  for (const name of sheets) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false });
    const { row, mapped, unmapped } = findHeaderRow(aoa);
    console.log(`\n  sheet "${name}" (${aoa.length} rows), 見出しは ${row + 1} 行目と判定`);
    for (const [key, v] of Object.entries(mapped)) {
      console.log(`    col ${v.index}  ${JSON.stringify(v.raw).padEnd(28)} → ${key}`);
    }
    for (const v of unmapped) {
      console.log(`    col ${v.index}  ${JSON.stringify(v.raw).padEnd(28)} → (未対応: HEADER_SYNONYMS に足す)`);
    }
    const missing = ["name", "carrierFreq", "targetBeatFreq"].filter((k) => !(k in mapped));
    if (missing.length) console.log(`    ⚠ 必須項目が見つからない: ${missing.join(", ")}`);
    console.log("  先頭3行:");
    for (const r of aoa.slice(row + 1, row + 4)) {
      const o = {};
      for (const [key, v] of Object.entries(mapped)) o[key] = r[v.index];
      console.log(`    ${JSON.stringify(o)}`);
    }
  }
}

/** 既存カタログの id・名前・英題を読む。行は1行1件で書いてあるので素直に拾える。 */
function readCatalogEntries() {
  const files = ["target.ts", "energy.ts"].map((f) => path.join(root, "lib", "catalog", f));
  const entries = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const re = /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*titleEn:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) entries.push({ id: m[1], name: m[2], titleEn: m[3] });
  }
  return entries;
}

function generate(file, dryRun) {
  const entries = readCatalogEntries();
  if (entries.length === 0) {
    console.error("カタログから節目を1件も読めなかった。lib/catalog/*.ts の行の書き方が変わっていないか確認すること。");
    process.exit(1);
  }
  const byName = new Map();
  for (const e of entries) {
    byName.set(normName(e.name), e);
    byName.set(normName(e.titleEn), e);
  }

  const { wb, sheets } = readSheet(file);
  const found = new Map();
  const unmatched = [];

  for (const sheetName of sheets) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false });
    const { row, mapped } = findHeaderRow(aoa);
    if (!mapped.name) continue;
    for (const r of aoa.slice(row + 1)) {
      const rawName = r[mapped.name.index];
      if (!rawName) continue;
      const hit =
        byName.get(normName(rawName)) ??
        (mapped.titleEn ? byName.get(normName(r[mapped.titleEn.index])) : undefined);
      if (!hit) {
        unmatched.push(String(rawName));
        continue;
      }
      const params = {
        carrierFreq: mapped.carrierFreq ? toNumber(r[mapped.carrierFreq.index]) : undefined,
        targetBeatFreq: mapped.targetBeatFreq ? toNumber(r[mapped.targetBeatFreq.index]) : undefined,
        durationMin: mapped.durationMin ? toNumber(r[mapped.durationMin.index]) : undefined,
      };
      // 載波と差周波の両方が取れた行だけを「確定」とみなす。片方だけ入れると
      // paramsProvisional が外れたのに中身は暫定、という一番わかりにくい状態になる。
      if (params.carrierFreq === undefined || params.targetBeatFreq === undefined) {
        unmatched.push(`${rawName}（周波数の列が読めない）`);
        continue;
      }
      found.set(hit.id, params);
    }
  }

  const missing = entries.filter((e) => !found.has(e.id));
  console.log(`\n取り込み: ${found.size} 件 / カタログ ${entries.length} 件`);
  if (unmatched.length) {
    console.log(`\n⚠ カタログに見当たらない xlsx の行（${unmatched.length}）:`);
    for (const n of unmatched) console.log(`    ${n}`);
  }
  if (missing.length) {
    console.log(`\n⚠ xlsx に出てこなかったカタログの節目（${missing.length}、暫定値のまま）:`);
    for (const e of missing) console.log(`    ${e.id}  ${e.name}`);
  }

  const body = [...found.entries()]
    .map(([id, p]) => {
      const fields = [`carrierFreq: ${p.carrierFreq}`, `targetBeatFreq: ${p.targetBeatFreq}`];
      if (p.durationMin !== undefined) fields.push(`durationMin: ${p.durationMin}`);
      return `  "${id}": { ${fields.join(", ")} },`;
    })
    .join("\n");

  const out = `// @generated by scripts/import-program-xlsx.mjs — 直接編集しない
// 取り込み元: ${path.basename(file)}
import type { CatalogParams } from "./factory";

/**
 * 一覧 xlsx から取り込んだ確定パラメータ。ここに id が載っている節目は
 * paramsProvisional が外れる。名前・よみ・アイコン・並び順は
 * lib/catalog/{target,energy}.ts 側が持ち、この生成物では触らない。
 */
export const CATALOG_PARAMS: Readonly<Record<string, CatalogParams>> = {
${body}
};
`;

  if (dryRun) {
    console.log("\n--dry-run のため書き込まない。生成される内容:\n");
    console.log(out);
    return;
  }
  fs.writeFileSync(OUT, out);
  console.log(`\n書き込み: ${path.relative(root, OUT)}`);
}

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const inspectFile = argv.includes("--inspect") ? arg("--inspect") : undefined;
const inFile = arg("--in");

if (inspectFile) {
  inspect(path.resolve(root, inspectFile));
} else if (inFile) {
  generate(path.resolve(root, inFile), argv.includes("--dry-run"));
} else {
  console.error(
    [
      "使い方:",
      "  node scripts/import-program-xlsx.mjs --inspect <file.xlsx>   見出しの対応を確認する（先にこれ）",
      "  node scripts/import-program-xlsx.mjs --in <file.xlsx> [--dry-run]",
    ].join("\n")
  );
  process.exit(1);
}
