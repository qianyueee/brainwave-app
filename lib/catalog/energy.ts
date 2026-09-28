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
  { id: "energy-c0-earth-star",      name: "アーススター（第0チャクラ）",            titleEn: "Earth Star",       description: "大地とつながる土台づくり",     icon: "🌍", carrierFreq: 174, targetBeatFreq: 2, nameEn: "Earth Star (Chakra 0)", descriptionEn: "Build a foundation connected to the earth" },
  { id: "energy-c1-muladhara",       name: "ルート（第1チャクラ）",                  titleEn: "Muladhara",        description: "生きる力と安心の根を張る",     icon: "🔴", carrierFreq: 396, targetBeatFreq: 4, nameEn: "Root (Chakra 1)", descriptionEn: "Muladhara: grow roots of vitality and security" },
  { id: "energy-c2-svadhisthana",    name: "サクラル（第2チャクラ）",                titleEn: "Svadhisthana",     description: "感情と創造性をゆるめる",       icon: "🟠", carrierFreq: 417, targetBeatFreq: 6, nameEn: "Sacral (Chakra 2)", descriptionEn: "Svadhisthana: loosen feelings and creativity" },
  { id: "energy-c3-manipura",        name: "ソーラープレクサス（第3チャクラ）",      titleEn: "Manipura",         description: "自信と意志の火を灯す",         icon: "🟡", carrierFreq: 528, targetBeatFreq: 10, nameEn: "Solar Plexus (Chakra 3)", descriptionEn: "Manipura: light the fire of confidence and will" },
  { id: "energy-c4-anahata",         name: "ハート（第4チャクラ）",                  titleEn: "Anahata",          description: "心をひらき、調和へ",           icon: "💚", carrierFreq: 639, targetBeatFreq: 7.83, nameEn: "Heart (Chakra 4)", descriptionEn: "Anahata: open your heart toward harmony" },
  { id: "energy-c5-vishuddha",       name: "スロート（第5チャクラ）",                titleEn: "Vishuddha",        description: "伝える力と表現を通す",         icon: "🔵", carrierFreq: 741, targetBeatFreq: 12, nameEn: "Throat (Chakra 5)", descriptionEn: "Vishuddha: let your voice and expression flow" },
  { id: "energy-c6-ajna",            name: "サードアイ（第6チャクラ）",              titleEn: "Ajna",             description: "直感と洞察を澄ませる",         icon: "🟣", carrierFreq: 852, targetBeatFreq: 14, nameEn: "Third Eye (Chakra 6)", descriptionEn: "Ajna: clear your intuition and insight" },
  { id: "energy-c7-sahasrara",       name: "クラウン（第7チャクラ）",                titleEn: "Sahasrara",        description: "気づきと統合へひらく",         icon: "👑", carrierFreq: 963, targetBeatFreq: 20, nameEn: "Crown (Chakra 7)", descriptionEn: "Sahasrara: open to awareness and wholeness" },
  { id: "energy-c8-soul-star",       name: "ソウルスター（第8チャクラ）",            titleEn: "Soul Star",        description: "魂の記憶とつながる",           icon: "⭐", carrierFreq: 111, targetBeatFreq: 20, nameEn: "Soul Star (Chakra 8)", descriptionEn: "Connect with the memory of the soul" },
  { id: "energy-c9-spirit",          name: "スピリット（第9チャクラ）",              titleEn: "Spirit",           description: "個を超えた静けさへ",           icon: "✨", carrierFreq: 222, targetBeatFreq: 20, nameEn: "Spirit (Chakra 9)", descriptionEn: "Toward a stillness beyond the self" },
  { id: "energy-c10-universal",      name: "ユニバーサル（第10チャクラ）",           titleEn: "Universal",        description: "全体とひとつに戻る",           icon: "🌌", carrierFreq: 333, targetBeatFreq: 40, nameEn: "Universal (Chakra 10)", descriptionEn: "Return to oneness with the whole" },
  { id: "energy-c11-galactic",       name: "ギャラクティック（第11チャクラ）",       titleEn: "Galactic",         description: "広がりと拡張の意識へ",         icon: "🌠", carrierFreq: 444, targetBeatFreq: 40, nameEn: "Galactic (Chakra 11)", descriptionEn: "Toward a vast, expanding awareness" },
  { id: "energy-c12-divine-gateway", name: "ディヴァイン・ゲートウェイ（第12チャクラ）", titleEn: "Divine Gateway", description: "源へ還る最終の門",             icon: "🕊️", carrierFreq: 888, targetBeatFreq: 40, nameEn: "Divine Gateway (Chakra 12)", descriptionEn: "The final gate back to the source" },
];

export const ENERGY_PROGRAMS: ProgramConfig[] = ENTRIES.map((e) =>
  createCatalogProgram({ ...e, category: "energy" })
);
