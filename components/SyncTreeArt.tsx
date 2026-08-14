"use client";

import { useId } from "react";
import { TREE_STAGE_COUNT } from "@/lib/sync-tree";

/**
 * Sync Tree — 「手描きの光の樹」16段階のステージアート。
 *
 * パス・グラデーション・線幅はデザインハンドオフ（sync-tree-stages.html）の
 * 確定データそのまま。座標はすべて viewBox 120×140 の空間で、樹の接地線は
 * y=124。アートディレクション上、真円・ドット・破線オービットは禁止——
 * きらめきは手描きの4点星、花は5弁の落書き、実はいびつな丸で描いてある。
 * 樹本体（葉・幹のパレット）はテーマで変わらない固定色。
 *
 * - SyncTreeFigure: 樹本体＋段階固有のきらめき等だけの <g>（オーラ・地面は
 *   持たない）。ホームのシーンカードが transform をかけて空に置く。
 * - SyncTreeStageTile: ギャラリー用の 120×140 タイル1枚ぶんの <svg>
 *   （段階ごとのオーラ＋地面＋樹）。タイル背景は呼び出し側が敷く。
 */

// ── 共有パス（ハンドオフの SVG ボキャブラリ） ──

/** 雲形の樹冠ブロブ（原点中心 ~38×28） */
const BLOB =
  "M-15,3 C-19,-4 -12,-12 -4,-11 C-1,-17 11,-17 14,-10 C21,-9 23,-1 17,3 C18,9 9,13 3,10 C-3,15 -13,12 -15,3 Z";
/** ブロブ内のハイライトのひと筆 */
const BLOB_HL = "M-8,-5 C-4,-8 2,-9 7,-6.5";
/** 手描きの4点星きらめき（ホームのシーンカードも同じ筆致を使う） */
export const TREE_SPARKLE_PATH =
  "M0,-5 C0.6,-1.2 1.2,-0.6 5,0 C1.2,0.6 0.6,1.2 0,5 C-0.6,1.2 -1.2,-0.6 -5,0 C-1.2,-0.6 -0.6,-1.2 0,-5 Z";
const SPARKLE = TREE_SPARKLE_PATH;
/** 5弁の花の落書き */
const FLOWER =
  "M0,-5.5 C2,-5.5 3,-3.5 2,-2 C4.5,-2.5 6,-0.5 4.5,1.2 C5.5,3.5 3.5,5.5 1.5,4.2 C1,6.5 -2,6.5 -2.5,4.2 C-4.5,5.2 -6.2,3 -5,1 C-6.5,-0.8 -5,-3 -2.8,-2.5 C-3.5,-4.5 -2,-6 0,-5.5 Z";
const FLOWER_DOT =
  "M0,-1.2 C1.2,-1.2 1.2,1.2 0,1.2 C-1.2,1.2 -1.2,-1.2 0,-1.2 Z";
/** いびつな金の実 */
const FRUIT =
  "M0,-3.4 C2.4,-3.6 3.6,-1.6 3.2,0.8 C2.8,3 0.8,4 -1,3.5 C-2.9,3 -3.7,0.9 -3,-1.2 C-2.5,-2.8 -1.3,-3.3 0,-3.4 Z";
const FRUIT_STEM = "M0,-4 C0.5,-5.5 1.5,-6 2.5,-6.5";

interface Ids {
  leaf: string;
  leafB: string;
  leafGold: string;
  trunk: string;
}

// ── 部品 ──

function Blob({
  t,
  ids,
  layer = "front",
  sw = 1,
  so = 0.5,
  hl = false,
  hlw,
  hlc,
}: {
  t: string;
  ids: Ids;
  layer?: "front" | "back" | "gold";
  /** 前面ブロブの輪郭線幅 */
  sw?: number;
  /** 前面ブロブの輪郭の不透明度（rgba(230,225,255,so)） */
  so?: number;
  /** ハイライトのひと筆を入れるか */
  hl?: boolean;
  hlw?: number;
  hlc?: string;
}) {
  if (layer === "back") {
    return (
      <g transform={t}>
        <path d={BLOB} fill={`url(#${ids.leafB})`} opacity={0.85} />
      </g>
    );
  }
  const gold = layer === "gold";
  return (
    <g transform={t}>
      <path
        d={BLOB}
        fill={gold ? `url(#${ids.leafGold})` : `url(#${ids.leaf})`}
        stroke={gold ? "rgba(255,240,200,0.6)" : `rgba(230,225,255,${so})`}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {hl && (
        <path
          d={BLOB_HL}
          fill="none"
          stroke={hlc ?? "rgba(255,255,255,0.5)"}
          strokeWidth={hlw ?? sw}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

/** 幼樹以降の枝のひと筆 */
function Branch({ d, w }: { d: string; w: number }) {
  return (
    <path d={d} stroke="#a495e6" strokeWidth={w} fill="none" strokeLinecap="round" />
  );
}

/** 芽〜苗（02-05）のミントの茎 */
function Stem({ d, w }: { d: string; w: number }) {
  return (
    <path d={d} stroke="#8ef0d8" strokeWidth={w} fill="none" strokeLinecap="round" />
  );
}

/** 苗期の葉（グラデ1枚ずつの落書き葉） */
function Leaf({ d, ids, back = false }: { d: string; ids: Ids; back?: boolean }) {
  return (
    <path
      d={d}
      fill={back ? `url(#${ids.leafB})` : `url(#${ids.leaf})`}
      stroke={back ? "rgba(230,225,255,0.4)" : "rgba(230,225,255,0.5)"}
      strokeWidth={1}
      strokeLinejoin="round"
    />
  );
}

/** 先端の金の蕾 */
function Bud({ d }: { d: string }) {
  return <path d={d} fill="#ffe9a8" />;
}

function Trunk({ d, ids }: { d: string; ids: Ids }) {
  return (
    <path
      d={d}
      fill={`url(#${ids.trunk})`}
      stroke="rgba(228,222,255,0.55)"
      strokeWidth={1}
      strokeLinejoin="round"
    />
  );
}

function Sparkle({
  x,
  y,
  s,
  fill,
  o,
}: {
  x: number;
  y: number;
  s: number;
  fill: string;
  o: number;
}) {
  return (
    <path
      d={SPARKLE}
      transform={`translate(${x},${y}) scale(${s})`}
      fill={fill}
      opacity={o}
    />
  );
}

function Flower({ t, dot = false }: { t: string; dot?: boolean }) {
  return (
    <g transform={t}>
      <path
        d={FLOWER}
        fill="#ffd9f2"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth={0.6}
      />
      {dot && <path d={FLOWER_DOT} fill="#ffe9a8" />}
    </g>
  );
}

function Fruit({ t, stem = false }: { t: string; stem?: boolean }) {
  return (
    <g transform={t}>
      {stem && (
        <path
          d={FRUIT_STEM}
          stroke="#c8b88a"
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
        />
      )}
      <path
        d={FRUIT}
        fill="#ffcf7d"
        stroke="rgba(255,244,214,0.8)"
        strokeWidth={0.8}
      />
    </g>
  );
}

// ── 各段階（tree: 樹本体＋段階固有のきらめき。aura: タイル用オーラ楕円） ──

interface StageArt {
  aura: { cx: number; cy: number; rx: number; ry: number };
  Art: (props: { ids: Ids }) => React.ReactNode;
}

const STAGE_ART: StageArt[] = [
  // 01 星の種 — 地面に光る金の種、ミントの芽のカール、流星めいたきらめき1つ
  {
    aura: { cx: 60, cy: 110, rx: 22, ry: 16 },
    Art: () => (
      <>
        <path
          d="M60,105 C65,106 67,112 63.5,116.5 C61.5,119 57.5,118.5 56,115.5 C54,111.5 56,106.5 60,105 Z"
          fill="#ffe9a8"
          stroke="rgba(255,250,230,0.75)"
          strokeWidth={1}
          strokeLinejoin="round"
        />
        <path
          d="M60,105 C59,101 62.5,99 64.5,100.5"
          stroke="#b9f2dd"
          strokeWidth={1.4}
          fill="none"
          strokeLinecap="round"
        />
        <Sparkle x={84} y={58} s={0.8} fill="#fff" o={0.65} />
      </>
    ),
  },
  // 02 発芽 — 曲がったミントの茎、グラデ葉1枚＋小さな2枚目、脇に種の殻
  {
    aura: { cx: 55, cy: 104, rx: 22, ry: 18 },
    Art: ({ ids }) => (
      <>
        <path
          d="M64,119 C66.5,117 68,119 66.5,121.5 C65,123 63.5,121.5 64,119 Z"
          fill="#ffe9a8"
          opacity={0.8}
        />
        <Stem d="M60,122 C60,115 56.5,111 54.5,105" w={2.4} />
        <Leaf d="M54.5,105 Q46,99 40.5,103 Q47,110 54.5,105 Z" ids={ids} />
        <path
          d="M57,111 Q63,107.5 66.5,110 Q62.5,114 57,111 Z"
          fill={`url(#${ids.leafB})`}
          opacity={0.9}
        />
      </>
    ),
  },
  // 03 双葉 — まっすぐな茎に対の葉、先端に金の蕾
  {
    aura: { cx: 60, cy: 100, rx: 24, ry: 18 },
    Art: ({ ids }) => (
      <>
        <Stem d="M60,122 C60.5,114 59.5,108 60,101" w={2.4} />
        <Leaf d="M60,102 Q51,96 44,99.5 Q51,107 60,102 Z" ids={ids} />
        <Leaf d="M60,102 Q69,96 76,99.5 Q69,107 60,102 Z" ids={ids} back />
        <Bud d="M60,97.5 C62,97.5 62.4,100.5 60,100.8 C57.6,100.5 58,97.5 60,97.5 Z" />
      </>
    ),
  },
  // 04 本葉 — 背が伸び、葉2対（下の対が大きい）
  {
    aura: { cx: 60, cy: 98, rx: 26, ry: 20 },
    Art: ({ ids }) => (
      <>
        <Stem d="M60,122 C60.5,113 59.5,104 60,95" w={2.6} />
        <Leaf d="M60,110 Q51,105 44,108 Q51,115 60,110 Z" ids={ids} back />
        <Leaf d="M60,110 Q69,105 76,108 Q69,115 60,110 Z" ids={ids} />
        <Leaf d="M60,101 Q53.5,96 48,98.5 Q54,105 60,101 Z" ids={ids} />
        <Leaf d="M60,101 Q66.5,96 72,98.5 Q66,105 60,101 Z" ids={ids} back />
        <Bud d="M60,91.5 C62.2,91.5 62.6,94.8 60,95.1 C57.4,94.8 57.8,91.5 60,91.5 Z" />
      </>
    ),
  },
  // 05 苗立ち — 葉3対、茎が太くなる
  {
    aura: { cx: 60, cy: 94, rx: 28, ry: 24 },
    Art: ({ ids }) => (
      <>
        <Stem d="M60,122 C60.6,111 59.4,100 60,89" w={2.8} />
        <Leaf d="M60,113 Q50.5,108 43.5,111 Q51,118 60,113 Z" ids={ids} back />
        <Leaf d="M60,113 Q69.5,108 76.5,111 Q69,118 60,113 Z" ids={ids} />
        <Leaf d="M60,104 Q52.5,99 46.5,101.5 Q53,108 60,104 Z" ids={ids} />
        <Leaf d="M60,104 Q67.5,99 73.5,101.5 Q67,108 60,104 Z" ids={ids} back />
        <Leaf d="M60,96 Q54.5,91.5 50,93.5 Q55,99.5 60,96 Z" ids={ids} back />
        <Leaf d="M60,96 Q65.5,91.5 70,93.5 Q65,99.5 60,96 Z" ids={ids} />
        <Bud d="M60,85.5 C62.4,85.5 62.8,89 60,89.3 C57.2,89 57.6,85.5 60,85.5 Z" />
      </>
    ),
  },
  // 06 若苗 — 茎が先細りの幹に。最初のブロブ樹冠（奥＋ハイライト付きの手前）
  {
    aura: { cx: 60, cy: 90, rx: 28, ry: 24 },
    Art: ({ ids }) => (
      <>
        <Trunk ids={ids} d="M57.8,124 C58.4,116 56.8,108 60,101 C63,108 61.6,116 62.2,124 Z" />
        <Blob t="translate(62,88) scale(0.62) rotate(6)" ids={ids} layer="back" />
        <Blob t="translate(59,85) scale(0.68)" ids={ids} sw={1.1} hl hlw={1.2} />
      </>
    ),
  },
  // 07 幼木 — 左枝1本、2ブロブ樹冠
  {
    aura: { cx: 60, cy: 86, rx: 30, ry: 26 },
    Art: ({ ids }) => (
      <>
        <Trunk ids={ids} d="M57,124 C58,113 55.5,102 60,93 C64.5,102 62,113 63,124 Z" />
        <Branch d="M59.5,106 C53,102 48.5,99.5 44,96.5" w={2.2} />
        <Blob t="translate(46,92) scale(0.6) rotate(-8)" ids={ids} layer="back" />
        <Blob t="translate(65,81) scale(0.8)" ids={ids} sw={1.1} hl hlw={1.2} />
      </>
    ),
  },
  // 08 枝分かれ — 枝2本、3ブロブ樹冠
  {
    aura: { cx: 60, cy: 82, rx: 32, ry: 28 },
    Art: ({ ids }) => (
      <>
        <Trunk ids={ids} d="M57,124 C58,113 55.5,102 60,92 C64.5,102 62,113 63,124 Z" />
        <Branch d="M59.5,106 C53,101.5 48,98.5 43.5,95.5" w={2.2} />
        <Branch d="M60.5,100 C67,96 72,94 77,91.5" w={2.2} />
        <Blob t="translate(46,89) scale(0.66) rotate(-6)" ids={ids} layer="back" />
        <Blob t="translate(74,89) scale(0.66) rotate(5)" ids={ids} so={0.45} />
        <Blob t="translate(60,74) scale(0.85)" ids={ids} sw={1.1} hl hlw={1.2} />
      </>
    ),
  },
  // 09 葉茂り — 5ブロブでシルエットが埋まる
  {
    aura: { cx: 60, cy: 80, rx: 34, ry: 30 },
    Art: ({ ids }) => (
      <>
        <Trunk ids={ids} d="M57,124 C58,113 55.5,102 60,91 C64.5,102 62,113 63,124 Z" />
        <Branch d="M59.5,105 C52,100 47,97 42,93.5" w={2.3} />
        <Branch d="M60.5,99 C68,94.5 73,92.5 78,90" w={2.3} />
        <Blob t="translate(44,88) scale(0.7) rotate(-7)" ids={ids} layer="back" />
        <Blob t="translate(76,87) scale(0.7) rotate(6)" ids={ids} so={0.45} />
        <Blob t="translate(52,72) scale(0.8) rotate(-4)" ids={ids} />
        <Blob t="translate(69,76) scale(0.78) rotate(8)" ids={ids} layer="back" />
        <Blob t="translate(60,80) scale(0.9)" ids={ids} sw={1.1} hl hlw={1.2} />
      </>
    ),
  },
  // 10 若木 — 頂部ブロブ含む6ブロブ（ホーム例 62% はこの段階）
  {
    aura: { cx: 60, cy: 76, rx: 36, ry: 32 },
    Art: ({ ids }) => (
      <>
        <Trunk ids={ids} d="M56.4,124 C57.6,111 54,99 60,88 C66,99 62.4,111 63.6,124 Z" />
        <Branch d="M59.5,104 C51,98.5 46,95.5 41,92" w={2.4} />
        <Branch d="M60.5,98 C69,93 74,91 79,88.5" w={2.4} />
        <Blob t="translate(40,86) scale(0.72) rotate(-8)" ids={ids} layer="back" />
        <Blob t="translate(80,86) scale(0.72) rotate(7)" ids={ids} so={0.45} />
        <Blob t="translate(50,70) scale(0.85) rotate(-5)" ids={ids} />
        <Blob t="translate(70,71) scale(0.85) rotate(6)" ids={ids} layer="back" />
        <Blob t="translate(60,62) scale(0.6)" ids={ids} />
        <Blob t="translate(60,80) scale(0.95)" ids={ids} sw={1.1} hl hlw={1.2} />
      </>
    ),
  },
  // 11 枝張り — 枝の広がりが x=34/86 まで届く、金のきらめき1つ
  {
    aura: { cx: 60, cy: 76, rx: 38, ry: 32 },
    Art: ({ ids }) => (
      <>
        <Trunk ids={ids} d="M56.4,124 C57.6,111 54,99 60,87 C66,99 62.4,111 63.6,124 Z" />
        <Branch d="M59.5,104 C49,97.5 43,94 37,90" w={2.5} />
        <Branch d="M60.5,98 C71,92 77,89.5 83,86.5" w={2.5} />
        <Blob t="translate(34,86) scale(0.66) rotate(-9)" ids={ids} layer="back" />
        <Blob t="translate(86,86) scale(0.66) rotate(8)" ids={ids} so={0.45} />
        <Blob t="translate(44,74) scale(0.8) rotate(-5)" ids={ids} />
        <Blob t="translate(76,74) scale(0.8) rotate(6)" ids={ids} layer="back" />
        <Blob t="translate(58,64) scale(0.8)" ids={ids} />
        <Blob t="translate(62,80) scale(0.95) rotate(3)" ids={ids} sw={1.1} hl hlw={1.2} />
        <Sparkle x={94} y={54} s={0.7} fill="#ffe9a8" o={0.75} />
      </>
    ),
  },
  // 12 樹冠形成 — 大ブロブ1つ（1.5×1.25）が2つの下ブロブを覆う
  {
    aura: { cx: 60, cy: 74, rx: 40, ry: 34 },
    Art: ({ ids }) => (
      <>
        <Trunk ids={ids} d="M56.4,124 C57.6,111 54,99 60,88 C66,99 62.4,111 63.6,124 Z" />
        <Branch d="M59.5,102 C50,95 44,90.5 39,86.5" w={2.6} />
        <Branch d="M60.5,102 C70,95 76,90.5 81,86.5" w={2.6} />
        <Blob t="translate(46,84) scale(0.9) rotate(-6)" ids={ids} layer="back" />
        <Blob t="translate(74,84) scale(0.9) rotate(6)" ids={ids} layer="back" />
        <Blob t="translate(60,72) scale(1.5,1.25)" ids={ids} sw={0.9} hl hlw={0.9} />
      </>
    ),
  },
  // 13 成木 — 幹が太く（基部幅~9）、最大の樹冠（1.6×1.3）
  {
    aura: { cx: 60, cy: 72, rx: 42, ry: 36 },
    Art: ({ ids }) => (
      <>
        <Trunk ids={ids} d="M55.5,124 C57,110 53,98 60,86 C67,98 63,110 64.5,124 Z" />
        <Branch d="M59.5,102 C48,94 42,89.5 36,85" w={2.8} />
        <Branch d="M60.5,102 C72,94 78,89.5 84,85" w={2.8} />
        <Blob t="translate(38,84) scale(0.75) rotate(-8)" ids={ids} layer="back" />
        <Blob t="translate(82,84) scale(0.75) rotate(8)" ids={ids} layer="back" />
        <Blob t="translate(60,86) scale(1.0)" ids={ids} layer="back" />
        <Blob t="translate(60,68) scale(1.6,1.3)" ids={ids} sw={0.85} hl hlw={0.85} />
        <Sparkle x={90} y={48} s={0.75} fill="#fff" o={0.6} />
      </>
    ),
  },
  // 14 開花 — 樹冠にピンクの花の落書き5つ
  {
    aura: { cx: 60, cy: 72, rx: 42, ry: 36 },
    Art: ({ ids }) => (
      <>
        <Trunk ids={ids} d="M55.5,124 C57,110 53,98 60,86 C67,98 63,110 64.5,124 Z" />
        <Branch d="M59.5,102 C48,94 42,89.5 36,85" w={2.8} />
        <Branch d="M60.5,102 C72,94 78,89.5 84,85" w={2.8} />
        <Blob t="translate(38,84) scale(0.75) rotate(-8)" ids={ids} layer="back" />
        <Blob t="translate(82,84) scale(0.75) rotate(8)" ids={ids} layer="back" />
        <Blob t="translate(60,68) scale(1.6,1.3)" ids={ids} sw={0.85} />
        <Flower t="translate(44,68) scale(0.85)" dot />
        <Flower t="translate(62,56) scale(0.95) rotate(12)" dot />
        <Flower t="translate(78,72) scale(0.8) rotate(-10)" dot />
        <Flower t="translate(40,86) scale(0.7)" />
        <Flower t="translate(70,84) scale(0.75) rotate(18)" />
      </>
    ),
  },
  // 15 結実 — 花が5つのいびつな金の実に
  {
    aura: { cx: 60, cy: 72, rx: 42, ry: 36 },
    Art: ({ ids }) => (
      <>
        <Trunk ids={ids} d="M55.5,124 C57,110 53,98 60,86 C67,98 63,110 64.5,124 Z" />
        <Branch d="M59.5,102 C48,94 42,89.5 36,85" w={2.8} />
        <Branch d="M60.5,102 C72,94 78,89.5 84,85" w={2.8} />
        <Blob t="translate(38,84) scale(0.75) rotate(-8)" ids={ids} layer="back" />
        <Blob t="translate(82,84) scale(0.75) rotate(8)" ids={ids} layer="back" />
        <Blob t="translate(60,68) scale(1.6,1.3)" ids={ids} sw={0.85} />
        <Fruit t="translate(44,72)" stem />
        <Fruit t="translate(60,62) scale(1.1)" stem />
        <Fruit t="translate(75,74)" stem />
        <Fruit t="translate(40,88) scale(0.9)" />
        <Fruit t="translate(70,88)" />
      </>
    ),
  },
  // 16 大樹 — 根張りのひと筆、8ブロブ＋金の頂部ブロブ、きらめき2つ、
  // 舞い落ちる金の葉。完成の姿
  {
    aura: { cx: 60, cy: 70, rx: 46, ry: 42 },
    Art: ({ ids }) => (
      <>
        <Trunk ids={ids} d="M54.5,124 C56.5,110 52,96 60,83 C68,96 63.5,110 65.5,124 Z" />
        <Branch d="M55,123 C52,120.5 49,119.5 46,119.5" w={2.2} />
        <Branch d="M65,123 C68,120.5 71,119.5 74,119.5" w={2.2} />
        <Branch d="M59.5,102 C46,92.5 40,88 33,83" w={3} />
        <Branch d="M60.5,102 C74,92.5 80,88 87,83" w={3} />
        <Blob t="translate(32,82) scale(0.72) rotate(-10)" ids={ids} layer="back" />
        <Blob t="translate(88,82) scale(0.72) rotate(10)" ids={ids} layer="back" />
        <Blob t="translate(42,70) scale(0.85) rotate(-6)" ids={ids} />
        <Blob t="translate(78,70) scale(0.85) rotate(6)" ids={ids} />
        <Blob t="translate(60,78) scale(1.35,1.15)" ids={ids} sw={0.9} hl hlw={0.9} />
        <Blob
          t="translate(60,52) scale(0.85)"
          ids={ids}
          layer="gold"
          hl
          hlw={1}
          hlc="rgba(255,255,255,0.6)"
        />
        <Sparkle x={94} y={42} s={0.9} fill="#fff" o={0.75} />
        <Sparkle x={26} y={50} s={0.7} fill="#ffe9a8" o={0.65} />
        <path
          d="M92,102 Q95,105 93,109 Q89,107 92,102 Z"
          fill={`url(#${ids.leafGold})`}
          opacity={0.8}
        />
      </>
    ),
  },
];

function clampStage(stage: number): number {
  if (!Number.isFinite(stage)) return 0;
  return Math.max(0, Math.min(TREE_STAGE_COUNT - 1, Math.floor(stage)));
}

function TreeGradientDefs({ ids }: { ids: Ids }) {
  return (
    <defs>
      <linearGradient id={ids.leaf} x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0" stopColor="#b6f5e0" />
        <stop offset="1" stopColor="#9a8bef" />
      </linearGradient>
      <linearGradient id={ids.leafB} x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0" stopColor="#7fd8c4" />
        <stop offset="1" stopColor="#6f5fc4" />
      </linearGradient>
      <linearGradient id={ids.leafGold} x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0" stopColor="#ffecb0" />
        <stop offset="1" stopColor="#f2a86e" />
      </linearGradient>
      <linearGradient id={ids.trunk} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#6d5cae" />
        <stop offset="1" stopColor="#a795e8" />
      </linearGradient>
    </defs>
  );
}

/**
 * 樹本体の <g>（120×140 空間、接地線 y=124）。親 <svg> 側で transform を
 * かけて使う。グラデ id は useId でインスタンスごとに一意（1ページに
 * ギャラリー16枚＋ホームカードが同居しても衝突しない）。
 */
export function SyncTreeFigure({ stage }: { stage: number }) {
  // useId の区切り記号（: や «»）は url(#…) 参照で扱いづらいので除いておく
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ids: Ids = {
    leaf: `tree-leaf-${uid}`,
    leafB: `tree-leafb-${uid}`,
    leafGold: `tree-gold-${uid}`,
    trunk: `tree-trunk-${uid}`,
  };
  const { Art } = STAGE_ART[clampStage(stage)];
  return (
    <g>
      <TreeGradientDefs ids={ids} />
      <Art ids={ids} />
    </g>
  );
}

/**
 * ギャラリー用タイル1枚（オーラ＋盛り土＋地面の線＋樹）。地面まわりの
 * 固定色はハンドオフのタイル仕様（深い星空タイルに載せる前提の色）。
 */
export function SyncTreeStageTile({
  stage,
  className,
}: {
  stage: number;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const auraId = `tree-aura-${uid}`;
  const i = clampStage(stage);
  const { aura } = STAGE_ART[i];
  const grand = i === TREE_STAGE_COUNT - 1;
  return (
    <svg viewBox="0 0 120 140" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={auraId}>
          <stop offset="0" stopColor="rgba(140,220,255,0.2)" />
          <stop offset="1" stopColor="rgba(140,220,255,0)" />
        </radialGradient>
      </defs>
      <ellipse
        cx={aura.cx}
        cy={aura.cy}
        rx={aura.rx}
        ry={aura.ry}
        fill={`url(#${auraId})`}
      />
      {/* 大樹（16）だけ地面がひとまわり広い */}
      <path
        d={grand ? "M32,124 Q60,115 88,124 Z" : "M38,124 Q60,117 82,124 Z"}
        fill={grand ? "rgba(140,200,255,0.1)" : "rgba(140,200,255,0.08)"}
      />
      <path
        d={
          grand
            ? "M22,124 Q42,119 60,121.5 Q80,124 98,120.5"
            : "M28,124 Q44,120 60,122 Q78,124 92,121"
        }
        fill="none"
        stroke={grand ? "rgba(170,205,255,0.45)" : "rgba(170,205,255,0.4)"}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
      <SyncTreeFigure stage={i} />
    </svg>
  );
}
