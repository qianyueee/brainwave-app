import type { ProgramCategory, ProgramConfig } from "../programs";
import { catalogPhases, type CatalogPhaseOptions } from "./phases";

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
 * カタログ節目はいまのところ全件が
 *   - audioPending: true（mp3 未納品。誘導ビートは実時間合成されるので再生は可能）
 *   - paramsProvisional: true（周波数は一覧 xlsx 未取り込みの暫定値）
 * なので、ここで一括して立てる。取り込みが済んだ節目から個別に外していく。
 */
export function createCatalogProgram(e: CatalogEntry): ProgramConfig {
  const opts: CatalogPhaseOptions = { intro: e.intro, outro: e.outro };
  const { phases, duration } = catalogPhases(e.targetBeatFreq, e.durationMin ?? 15, opts);

  return {
    id: e.id,
    category: e.category,
    subGenre: e.subGenre,
    name: e.name,
    titleEn: e.titleEn,
    description: e.description,
    icon: e.icon,
    carrierFreq: e.carrierFreq,
    // duration は phases と同じ計算から取る（ズレると嘘のバッジが出る。phases.ts 参照）
    defaultDuration: duration,
    targetBeatFreq: e.targetBeatFreq,
    phases,
    keywords: e.keywords,
    audioPending: true,
    paramsProvisional: true,
  };
}
