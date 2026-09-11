import type { ProgramCategory, ProgramConfig } from "../programs";
import { CATALOG_PARAMS } from "./params.generated";
import { catalogPhases, type CatalogPhaseOptions } from "./phases";

/** 一覧 xlsx が持っている値＝周波数と尺だけ。名前や並びは人の側が持つ。 */
export interface CatalogParams {
  carrierFreq?: number;
  targetBeatFreq?: number;
  durationMin?: number;
}

/**
 * カタログ1件の素の定義。周波数とタイムラインの決まりごとは
 * createCatalogProgram がまとめて面倒を見るので、各カタログ表は
 * 「名前・分類・載波・ビート」だけを持てばいい。
 */
export interface CatalogEntry {
  id: string;
  /** 表示名（日本語）。カードでは truncate されるので特徴のある語を先頭に。 */
  name: string;
  /** 英語原題。素材ファイル名の英語部分をそのまま。 */
  titleEn: string;
  description: string;
  icon: string;
  carrierFreq: number;
  targetBeatFreq: number;
  /** 既定 15 分。 */
  durationMin?: number;
  /** 入口・出口のビート（phases.ts 参照）。睡眠系は outro を下げたまま終える。 */
  intro?: number;
  outro?: number;
  category: ProgramCategory;
  subGenre?: string;
  /**
   * 検索用の追加語。名前や説明から導けない読みだけを足す
   * （漢字→かなは辞書が要るので機械では出せない）。カタカナは
   * normalizeSearchText がひらがなへ畳むので書かなくていい。
   */
  keywords?: string;
}

/**
 * カタログ節目はいまのところ全件が mp3 未納品（audioPending）。誘導ビートは
 * BinauralSession が実時間合成するので、再生自体は最後まで通常どおりできる。
 *
 * 周波数は既定で暫定値（paramsProvisional）だが、params.generated.ts に id が
 * 載っている＝一覧 xlsx から取り込み済みの節目はそちらが勝ち、印も外れる。
 */
export function createCatalogProgram(e: CatalogEntry): ProgramConfig {
  const confirmed = CATALOG_PARAMS[e.id];
  const carrierFreq = confirmed?.carrierFreq ?? e.carrierFreq;
  const targetBeatFreq = confirmed?.targetBeatFreq ?? e.targetBeatFreq;
  const durationMin = confirmed?.durationMin ?? e.durationMin ?? 15;

  const opts: CatalogPhaseOptions = { intro: e.intro, outro: e.outro };
  const { phases, duration } = catalogPhases(targetBeatFreq, durationMin, opts);

  return {
    id: e.id,
    category: e.category,
    subGenre: e.subGenre,
    name: e.name,
    titleEn: e.titleEn,
    description: e.description,
    icon: e.icon,
    carrierFreq,
    // duration は phases と同じ計算から取る（ズレると嘘のバッジが出る。phases.ts 参照）
    defaultDuration: duration,
    targetBeatFreq,
    phases,
    keywords: e.keywords,
    audioPending: true,
    ...(confirmed ? {} : { paramsProvisional: true as const }),
  };
}
