import type { ProgramConfig } from "../programs";
import { ENERGY_PROGRAMS } from "./energy";
import { TARGET_PROGRAMS } from "./target";

/**
 * カタログ＝Sync Session に新しく並ぶ節目（Target 42 ＋ Energy 13）。
 *
 * デフォルト4節目は PROGRAMS、星座節目は ZODIAC_PROGRAMS（どちらも
 * lib/programs.ts）にあるので、ここには入れない。4カテゴリを束ねるのは
 * lib/programs.ts の ALL_PROGRAMS / programsByCategory 側の仕事——
 * このディレクトリが lib/programs.ts を値として import すると循環するため、
 * 向きは常に programs.ts → catalog の一方通行に保つ（型だけ import type）。
 */
export const CATALOG_PROGRAMS: ProgramConfig[] = [...TARGET_PROGRAMS, ...ENERGY_PROGRAMS];

export { ENERGY_PROGRAMS } from "./energy";
export { TARGET_PROGRAMS, TARGET_SUB_GENRES, type TargetSubGenre } from "./target";
export { CATEGORIES, CATEGORY_LABEL, type CategoryMeta } from "./categories";
export { matchesQuery, normalizeSearchText, buildSearchText } from "./search";
export { catalogPhases, type CatalogTimeline } from "./phases";
