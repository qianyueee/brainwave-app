import type { BeatLayer, ProgramCategory, ProgramConfig } from "../programs";
import { PROGRAM_LIST } from "./program-list";
import { planTimeline } from "./phases";

/**
 * カタログ1件の素の定義。周波数は一覧の写し（program-list.ts）が持つので、
 * 各カタログ表は「名前・分類・アイコン・長さ」だけを持てばいい。
 */
export interface CatalogEntry {
  id: string;
  /** 表示名（日本語）。カードでは truncate されるので特徴のある語を先頭に。 */
  name: string;
  /** 英語原題。素材ファイル名の英語部分をそのまま。英語の画面ではこれが名前。 */
  titleEn: string;
  description: string;
  /** 英語の画面の名前。titleEn と違う呼び名にしたいときだけ（Energy）。 */
  nameEn?: string;
  /** 英語の画面の説明（プレイヤーで名前の下に出る）。 */
  descriptionEn?: string;
  icon: string;
  /** 既定 15 分（一覧には長さが無い。素材名に「6分」とあるものだけ 6）。 */
  durationMin?: number;
  category: ProgramCategory;
  subGenre?: string;
  subGenreEn?: string;
  /**
   * 検索用の追加語。名前や説明から導けない読みだけを足す
   * （漢字→かなは辞書が要るので機械では出せない）。カタカナは
   * normalizeSearchText がひらがなへ畳むので書かなくていい。
   */
  keywords?: string;
}

/**
 * 鳴らすキャリアの上限。50〜60代の聴覚に合わせて 1000Hz 以下（設計書
 * 「高周波すぎるキャリア音（1000Hz以上）は避け」）。バイノーラルビートも
 * 1000Hz を超えるキャリアでは聞き取りにくくなる。
 */
export const MAX_CARRIER_HZ = 1000;

/**
 * 一覧のキャリアを鳴らせる高さへ。1000Hz を超えるもの（Energy 第8〜第12 の
 * 1074〜1518Hz）は1オクターブずつ下げる——音名（曲との響き）は変えずに高さだけ
 * 下ろす。1000Hz 以下はそのまま。
 */
export function playableCarrier(hz: number): number {
  let c = hz;
  while (c > MAX_CARRIER_HZ) c /= 2;
  return Math.round(c * 100) / 100;
}

/** 一覧に載っていない id（足したのに写し忘れた）の受け皿。開発時は invariants が叫ぶ。 */
const MISSING_LISTING = { carrier: 432, beat: { kind: "steady", hz: 10 } } as const;

/**
 * 一覧の写し（PROGRAM_LIST）から周波数とタイムラインを作る。一覧に鳴らせる値が
 * 無い節目（provisional）は暫定値のまま印を付ける。
 */
export function createCatalogProgram(e: CatalogEntry): ProgramConfig {
  const listed = PROGRAM_LIST[e.id];
  const carrierFreq = playableCarrier(listed?.carrier ?? MISSING_LISTING.carrier);
  const plan = listed?.beat ?? MISSING_LISTING.beat;
  const { phases, duration, targetBeatFreq, extraBeat } = planTimeline(
    plan,
    e.durationMin ?? 15,
    listed?.outro
  );
  // layered の2つ目は1オクターブ下のキャリアで（同じキャリアに重ねると片耳で
  // 2音がぶつかり、狙っていないうなりが出来る）。
  const layers: BeatLayer[] | undefined =
    extraBeat !== undefined
      ? [{ carrierFreq: Math.round((carrierFreq / 2) * 100) / 100, beatFreq: extraBeat }]
      : undefined;

  return {
    id: e.id,
    category: e.category,
    subGenre: e.subGenre,
    subGenreEn: e.subGenreEn,
    name: e.name,
    titleEn: e.titleEn,
    nameEn: e.nameEn,
    description: e.description,
    descriptionEn: e.descriptionEn,
    icon: e.icon,
    carrierFreq,
    // duration は phases と同じ計算から取る（ズレると嘘のバッジが出る。phases.ts 参照）
    defaultDuration: duration,
    targetBeatFreq,
    phases,
    ...(layers ? { layers } : {}),
    keywords: e.keywords,
    ...(!listed || listed.provisional ? { paramsProvisional: true as const } : {}),
  };
}
