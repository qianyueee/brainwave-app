import type { ProgramConfig } from "../programs";
import { createCatalogProgram, type CatalogEntry } from "./factory";

/**
 * Energy — 第0〜第12 チャクラの 13 節目（素材フォルダ「Energyプログラム」）。
 *
 * 周波数（キャリア・脳波誘導波）は一覧「Energyプログラム一覧.xlsx」の写し
 * （program-list.ts）が持つ。第8〜第12 のキャリア（1074〜1518Hz）は鳴らすときに
 * 1オクターブ下げて 1000Hz 以下にする（factory.ts の playableCarrier）。第8 の
 * ビートは一覧の値（4096Hz）では鳴らせないので暫定のまま、第12 の Pure Void は
 * うなりの無い 0Hz（理由は program-list.ts の note）。
 */
const ENTRIES: ReadonlyArray<Omit<CatalogEntry, "category">> = [
  { id: "energy-c0-earth-star",      name: "アーススター（第0チャクラ）",            titleEn: "Earth Star",       description: "大地とつながる土台づくり",     icon: "🌍", nameEn: "Earth Star (Chakra 0)", descriptionEn: "Build a foundation connected to the earth" },
  { id: "energy-c1-muladhara",       name: "ルート（第1チャクラ）",                  titleEn: "Muladhara",        description: "生きる力と安心の根を張る",     icon: "🔴", nameEn: "Root (Chakra 1)", descriptionEn: "Muladhara: grow roots of vitality and security" },
  { id: "energy-c2-svadhisthana",    name: "サクラル（第2チャクラ）",                titleEn: "Svadhisthana",     description: "感情と創造性をゆるめる",       icon: "🟠", nameEn: "Sacral (Chakra 2)", descriptionEn: "Svadhisthana: loosen feelings and creativity" },
  { id: "energy-c3-manipura",        name: "ソーラープレクサス（第3チャクラ）",      titleEn: "Manipura",         description: "自信と意志の火を灯す",         icon: "🟡", nameEn: "Solar Plexus (Chakra 3)", descriptionEn: "Manipura: light the fire of confidence and will" },
  { id: "energy-c4-anahata",         name: "ハート（第4チャクラ）",                  titleEn: "Anahata",          description: "心をひらき、調和へ",           icon: "💚", nameEn: "Heart (Chakra 4)", descriptionEn: "Anahata: open your heart toward harmony" },
  { id: "energy-c5-vishuddha",       name: "スロート（第5チャクラ）",                titleEn: "Vishuddha",        description: "伝える力と表現を通す",         icon: "🔵", nameEn: "Throat (Chakra 5)", descriptionEn: "Vishuddha: let your voice and expression flow" },
  { id: "energy-c6-ajna",            name: "サードアイ（第6チャクラ）",              titleEn: "Ajna",             description: "直感と洞察を澄ませる",         icon: "🟣", nameEn: "Third Eye (Chakra 6)", descriptionEn: "Ajna: clear your intuition and insight" },
  { id: "energy-c7-sahasrara",       name: "クラウン（第7チャクラ）",                titleEn: "Sahasrara",        description: "気づきと統合へひらく",         icon: "👑", nameEn: "Crown (Chakra 7)", descriptionEn: "Sahasrara: open to awareness and wholeness" },
  { id: "energy-c8-soul-star",       name: "ソウルスター（第8チャクラ）",            titleEn: "Soul Star",        description: "魂の記憶とつながる",           icon: "⭐", nameEn: "Soul Star (Chakra 8)", descriptionEn: "Connect with the memory of the soul" },
  { id: "energy-c9-spirit",          name: "スピリット（第9チャクラ）",              titleEn: "Spirit",           description: "個を超えた静けさへ",           icon: "✨", nameEn: "Spirit (Chakra 9)", descriptionEn: "Toward a stillness beyond the self" },
  { id: "energy-c10-universal",      name: "ユニバーサル（第10チャクラ）",           titleEn: "Universal",        description: "全体とひとつに戻る",           icon: "🌌", nameEn: "Universal (Chakra 10)", descriptionEn: "Return to oneness with the whole" },
  { id: "energy-c11-galactic",       name: "ギャラクティック（第11チャクラ）",       titleEn: "Galactic",         description: "広がりと拡張の意識へ",         icon: "🌠", nameEn: "Galactic (Chakra 11)", descriptionEn: "Toward a vast, expanding awareness" },
  { id: "energy-c12-divine-gateway", name: "ディヴァイン・ゲートウェイ（第12チャクラ）", titleEn: "Divine Gateway", description: "源へ還る最終の門",             icon: "🕊️", nameEn: "Divine Gateway (Chakra 12)", descriptionEn: "The final gate back to the source" },
];

export const ENERGY_PROGRAMS: ProgramConfig[] = ENTRIES.map((e) =>
  createCatalogProgram({ ...e, category: "energy" })
);
