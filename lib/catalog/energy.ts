import type { ProgramConfig } from "../programs";
import { createCatalogProgram, type CatalogEntry } from "./factory";

/**
 * Energy — 第0〜第12 チャクラの 13 節目（素材フォルダ「Energyプログラム」）。
 *
 * ⚠ 周波数は暫定値。一覧「Energyプログラム一覧.xlsx」を
 * `node scripts/import-program-xlsx.mjs` で取り込むと確定値に置き換わる。
 * 暫定値の決め方は本プロジェクトの既存の語彙に合わせてある：
 *   - 載波は第0〜第7にソルフェジオ九音（星座節目の載波と同じ並び）、
 *     第8〜第12（超個人領域）は 111 系列。すべて 1000Hz 以下（聴覚配慮）。
 *   - ビートは MODULAR_BEATS（lib/zodiac.ts）の中からのみ選び、
 *     土台のδから頂輪・超個人のγへ向かって上げていく。
 */
const ENTRIES: ReadonlyArray<Omit<CatalogEntry, "category">> = [
  { id: "energy-c0-earth-star",      name: "アーススター（第0チャクラ）",            titleEn: "Earth Star",       description: "大地とつながる土台づくり",     icon: "🌍", carrierFreq: 174, targetBeatFreq: 2 },
  { id: "energy-c1-muladhara",       name: "ルート（第1チャクラ）",                  titleEn: "Muladhara",        description: "生きる力と安心の根を張る",     icon: "🔴", carrierFreq: 396, targetBeatFreq: 4 },
  { id: "energy-c2-svadhisthana",    name: "サクラル（第2チャクラ）",                titleEn: "Svadhisthana",     description: "感情と創造性をゆるめる",       icon: "🟠", carrierFreq: 417, targetBeatFreq: 6 },
  { id: "energy-c3-manipura",        name: "ソーラープレクサス（第3チャクラ）",      titleEn: "Manipura",         description: "自信と意志の火を灯す",         icon: "🟡", carrierFreq: 528, targetBeatFreq: 10 },
  { id: "energy-c4-anahata",         name: "ハート（第4チャクラ）",                  titleEn: "Anahata",          description: "心をひらき、調和へ",           icon: "💚", carrierFreq: 639, targetBeatFreq: 7.83 },
  { id: "energy-c5-vishuddha",       name: "スロート（第5チャクラ）",                titleEn: "Vishuddha",        description: "伝える力と表現を通す",         icon: "🔵", carrierFreq: 741, targetBeatFreq: 12 },
  { id: "energy-c6-ajna",            name: "サードアイ（第6チャクラ）",              titleEn: "Ajna",             description: "直感と洞察を澄ませる",         icon: "🟣", carrierFreq: 852, targetBeatFreq: 14 },
  { id: "energy-c7-sahasrara",       name: "クラウン（第7チャクラ）",                titleEn: "Sahasrara",        description: "気づきと統合へひらく",         icon: "👑", carrierFreq: 963, targetBeatFreq: 20 },
  { id: "energy-c8-soul-star",       name: "ソウルスター（第8チャクラ）",            titleEn: "Soul Star",        description: "魂の記憶とつながる",           icon: "⭐", carrierFreq: 111, targetBeatFreq: 20 },
  { id: "energy-c9-spirit",          name: "スピリット（第9チャクラ）",              titleEn: "Spirit",           description: "個を超えた静けさへ",           icon: "✨", carrierFreq: 222, targetBeatFreq: 20 },
  { id: "energy-c10-universal",      name: "ユニバーサル（第10チャクラ）",           titleEn: "Universal",        description: "全体とひとつに戻る",           icon: "🌌", carrierFreq: 333, targetBeatFreq: 40 },
  { id: "energy-c11-galactic",       name: "ギャラクティック（第11チャクラ）",       titleEn: "Galactic",         description: "広がりと拡張の意識へ",         icon: "🌠", carrierFreq: 444, targetBeatFreq: 40 },
  { id: "energy-c12-divine-gateway", name: "ディヴァイン・ゲートウェイ（第12チャクラ）", titleEn: "Divine Gateway", description: "源へ還る最終の門",             icon: "🕊️", carrierFreq: 888, targetBeatFreq: 40 },
];

export const ENERGY_PROGRAMS: ProgramConfig[] = ENTRIES.map((e) =>
  createCatalogProgram({ ...e, category: "energy" })
);
