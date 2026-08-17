// Time-based dynamic theme system — 4 palettes mapped to time of day.
// TIME_PERIODS must stay sorted by startHour and cover 0-24 without gaps:
// getEffectivePalette() crossfades to the array neighbours at each boundary.

export interface ThemePalette {
  navy: string;
  navyLight: string;
  navyLighter: string;
  primary: string;
  primaryDark: string;
  accent: string;
  accentDark: string;
  surface: string;
  surfaceBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Text on a primary-filled control (CTA). Contrast ≥4.5:1 vs primary. */
  onPrimary: string;
  /** Text on an accent-filled control (play state). Contrast ≥4.5:1 vs accent. */
  onAccent: string;
  /** Status colors, ≥4.5:1 vs surface in this palette. */
  success: string;
  warning: string;
  danger: string;
}

/**
 * Sky palette for the constellation art surfaces (Home's Astro Sync hero,
 * Session's Water Mandala hero). These used to be a fixed deep-night gradient
 * in every theme; a full-height night hero on the cream day palette read as a
 * cold slab dropped into a warm page. The sky now follows the time of day: all
 * four periods use a **deep ground with the figure glowing light**, and only the
 * hue moves — dawn rust (day), deep emerald (afternoon), dusk violet (evening),
 * night indigo (midnight). The star figures themselves are unchanged.
 *
 * The pale-ground / dark-ink variant (the printed star-chart convention) is
 * gone. It looked right in isolation, but `ZodiacConstellation` draws star cores
 * at opacity .95, so on a pale ground every star landed as a hard black dot —
 * the figure read as scribbles over the copy rather than as a sky. A deep ground
 * is also the only version where the halo/glow layers do anything.
 *
 * Note this makes the sky card a dark window on the two light pages (day,
 * afternoon) — the same relationship the Water Mandala hero and the night
 * Sync Tree card already have with their pages.
 *
 * `chip`/`glow`/`line` carry alpha, so values here may be hex OR rgba().
 */
export interface SkyPalette {
  /** Radial gradient stops, inner → outer. */
  a: string;
  b: string;
  c: string;
  /** Constellation line/star ink. */
  ink: string;
  /** Highest-contrast text on the sky (headings, program name). */
  strong: string;
  /** Secondary text on the sky. */
  text: string;
  /** Pill/chip background on the sky. */
  chip: string;
  /** Breathing halo behind the figure — sun-warm by day, moon-cool at night. */
  glow: string;
  /** Hairline divider on the sky. */
  line: string;
}

export interface TimePeriod {
  id: string;
  name: string;
  startHour: number;
  endHour: number;
  palette: ThemePalette;
  sky: SkyPalette;
}

export const TIME_PERIODS: TimePeriod[] = [
  {
    // 00-06: Midnight 癒 — ミッドナイト (midnight indigo)
    id: "midnight",
    name: "癒",
    startHour: 0,
    endHour: 6,
    palette: {
      navy: "#1E1B4B",
      navyLight: "#282558",
      navyLighter: "#322e68",
      primary: "#A78BFA",
      primaryDark: "#8B5CF6",
      accent: "#6EE7B7",
      accentDark: "#34D399",
      surface: "#252250",
      surfaceBorder: "#383468",
      textPrimary: "#e8e4f8",
      textSecondary: "#a8a0d0",
      textMuted: "#938ac2",
      // Lavender/mint fills are LIGHT — dark text (white was 2.7:1 / 1.5:1)
      onPrimary: "#1E1B4B",
      onAccent: "#1E1B4B",
      success: "#22c55e",
      warning: "#f97316",
      danger: "#f87171",
    },
    // Deep night — the original fixed sky, now just one of four
    sky: {
      a: "#2a3670",
      b: "#19224f",
      c: "#0a102e",
      ink: "#dfe9ff",
      strong: "#f2f0ff",
      text: "#a8b4dd",
      chip: "rgba(255,255,255,0.08)",
      glow: "rgba(165,190,255,0.30)",
      line: "rgba(255,255,255,0.12)",
    },
  },
  {
    // 06-12: Day 純 — サンライズ (sunrise) → blush coral
    //
    // 参照デザイン（淡い blush の地に、鮮やかな橘紅の面が1つ）に寄せた版。
    // 前段は琥珀寄りの杏色だったが、狙いの印象はもっと桃紅く、主色はもっと
    // 鮮やか——地色を blush へ、主色を焦げ茶に近い橙から鮮やかな橘紅
    // #c8330a へ上げ、accent は参照にある珊瑚桃から紅薔薇へ取った。
    // 地色を淡くしたのは、鮮やかな主色を 4.5:1 で載せられる明るさが必要だから
    // （濃い地のままだと主色を暗くするしかなく、鮮やかさが死ぬ）。
    id: "day",
    name: "純",
    startHour: 6,
    endHour: 12,
    palette: {
      navy: "#fde8de",
      navyLight: "#fef1ea",
      navyLighter: "#f4bda9",
      primary: "#c8330a",
      primaryDark: "#a52807",
      // 紅薔薇。橘紅の主色と喧嘩せず、warning（琥珀）とも読み分けられる色相。
      accent: "#b8285a",
      accentDark: "#9a1f4a",
      surface: "#fdece3",
      surfaceBorder: "#f3c9b5",
      textPrimary: "#2e1409",
      textSecondary: "#6e3620",
      textMuted: "#82492f",
      onPrimary: "#ffffff",
      onAccent: "#ffffff",
      // Deepened status hues — the defaults were picked against dark navy and
      // wash out on this blush ground. warning は主色の橘紅と同化しないよう
      // 琥珀寄りに置いている。
      success: "#166534",
      warning: "#8a4a0a",
      danger: "#a3102a",
    },
    // Dawn sky — 陽の差す側（グラデーション内側）が鮮やかな橘紅、外へ向かって
    // 珊瑚紅から深い栗へ落ちる。星座は白いクリームで光る。
    //
    // 紫を混ぜず全て暖色で通してあるのは参照デザインに紫が無いから。前段は
    // 錆色→藤紫→ほぼ黒（外周 L=0.010）で暗すぎたので、いちばん明るい側を
    // L=0.147 まで上げた——それでも星（3:1 で足りる装飾）は 4.85:1、本文は
    // 4.97:1 取れている。この明るさが上限：さらに明るくすると本文が 4.5:1 を
    // 割り、文字を濃くするしかなくなって「星が黒い」問題に逆戻りする。
    sky: {
      a: "#c8330a",
      b: "#a82f3e",
      c: "#6e2434",
      ink: "#fff2e6",
      strong: "#ffffff",
      text: "#fff5ee",
      chip: "rgba(255,255,255,0.14)",
      glow: "rgba(255,190,120,0.40)",
      line: "rgba(255,255,255,0.22)",
    },
  },
  {
    // 12-18: Afternoon 定 — エメラルド (emerald) → mint green
    id: "afternoon",
    name: "定",
    startHour: 12,
    endHour: 18,
    palette: {
      navy: "#c0e8d4",
      navyLight: "#d0f0e0",
      navyLighter: "#90c8a8",
      primary: "#047857",
      primaryDark: "#065f46",
      accent: "#0c6860",
      accentDark: "#0a5550",
      surface: "#c8ecda",
      surfaceBorder: "#90c8a8",
      textPrimary: "#082018",
      textSecondary: "#1e5840",
      textMuted: "#2f6a50",
      onPrimary: "#ffffff",
      onAccent: "#ffffff",
      success: "#166534",
      warning: "#9a3412",
      danger: "#991b1b",
    },
    // Deep emerald sky — 周囲のミントと同じ色族のまま、地色は暗い側へ。
    // 淡いミントの地では星の芯が黒い点になっていたので、他の3時間帯と同じく
    // 「暗い空に光る星座」へ揃えた（これで星座が黒く出る時間帯は無くなる）。
    // 陽の高い時刻なので halo だけは白に近い暖色を残し、真夜中の月光と
    // 見分けがつくようにしている。
    sky: {
      a: "#1e5c4e",
      b: "#0f3a32",
      c: "#06201c",
      ink: "#d9f7ec",
      strong: "#f0fdf8",
      text: "#9fd8c4",
      chip: "rgba(255,255,255,0.10)",
      glow: "rgba(255,245,200,0.34)",
      line: "rgba(255,255,255,0.16)",
    },
  },
  {
    // 18-00: Evening 放 — バイオレット (violet) → pastel violet
    id: "evening",
    name: "放",
    startHour: 18,
    endHour: 24,
    palette: {
      navy: "#dcc8f0",
      navyLight: "#e4d6f5",
      navyLighter: "#c0a8d8",
      primary: "#7C3AED",
      primaryDark: "#6D28D9",
      accent: "#c42070",
      accentDark: "#a81860",
      surface: "#e0d0f2",
      surfaceBorder: "#c4b0e0",
      textPrimary: "#1c1040",
      textSecondary: "#4a3080",
      textMuted: "#5a4390",
      onPrimary: "#ffffff",
      onAccent: "#ffffff",
      success: "#166534",
      warning: "#9a3412",
      danger: "#991b1b",
    },
    // Dusk — deep violet night sky, the figure glowing light. Keeps the warm
    // low-sun halo, which is what separates it from midnight's cool moonlight:
    // same darkness, last light of the day still in the air. The page palette
    // above stays pastel violet, so this card reads as an inset window onto the
    // evening sky (exactly how the Sync Tree scene sits on the same page).
    // 対比: text 5.1:1 / strong 9.1:1（グラデーション最明部 a に対して）
    sky: {
      a: "#4a3480",
      b: "#33215e",
      c: "#1c1040",
      ink: "#e9dfff",
      strong: "#f6f2ff",
      text: "#c3b0e8",
      chip: "rgba(255,255,255,0.10)",
      glow: "rgba(255,200,150,0.40)",
      line: "rgba(255,255,255,0.16)",
    },
  },
];

// --- Color math ---

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b))
      .toString(16)
      .slice(1)
  );
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t
  );
}

export function interpolatePalettes(
  a: ThemePalette,
  b: ThemePalette,
  t: number
): ThemePalette {
  const keys = Object.keys(a) as (keyof ThemePalette)[];
  const result = {} as ThemePalette;
  for (const key of keys) {
    result[key] = lerpColor(a[key], b[key], t);
  }
  return result;
}

// Sky tokens mix hex with rgba() (the halo and hairlines carry alpha), so they
// need a parser the palette lerp above doesn't — that one is hex-only.

function parseColor(color: string): [number, number, number, number] {
  if (color.startsWith("#")) {
    const [r, g, b] = hexToRgb(color);
    return [r, g, b, 1];
  }
  const parts = color
    .slice(color.indexOf("(") + 1, color.lastIndexOf(")"))
    .split(",")
    .map((p) => parseFloat(p));
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

function lerpSkyColor(a: string, b: string, t: number): string {
  const [ar, ag, ab, aa] = parseColor(a);
  const [br, bg, bb, ba] = parseColor(b);
  const r = ar + (br - ar) * t;
  const g = ag + (bg - ag) * t;
  const bl = ab + (bb - ab) * t;
  const alpha = aa + (ba - aa) * t;
  // Stay opaque-as-hex when both ends are opaque — the gradient stops and ink
  // are consumed as plain colors elsewhere.
  if (aa === 1 && ba === 1) return rgbToHex(r, g, bl);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(bl)},${alpha.toFixed(3)})`;
}

export function interpolateSky(a: SkyPalette, b: SkyPalette, t: number): SkyPalette {
  const keys = Object.keys(a) as (keyof SkyPalette)[];
  const result = {} as SkyPalette;
  for (const key of keys) {
    result[key] = lerpSkyColor(a[key], b[key], t);
  }
  return result;
}

/**
 * Backdrop for the Sync Tree scene card (Home). Coarser than the 4-way `sky`:
 * the two night themes (midnight, evening) share one starry night, while the
 * daylight side splits into sunrise (day, 06-12) and full daylight (afternoon,
 * 12-18). The night pair stays merged because a starry sky reads the same at
 * 2am and 8pm; the daylight pair does not — a sunrise sky and a midday sky are
 * visibly different times of day, and the page palette already distinguishes
 * them (apricot vs mint).
 *
 * The tree art itself (foliage/trunk palette) never theme-shifts; only this
 * backdrop, its ink (ground line + sparkles) and the card chrome
 * (border/shadow) do.
 */
export interface TreeSky {
  /** Radial gradient stops, inner → outer. */
  a: string;
  b: string;
  c: string;
  /** Ground line + hand-drawn sparkles. */
  ink: string;
  /** Soft aura behind the tree. */
  glow: string;
  /** Card border. */
  border: string;
  /** Card drop-shadow color. */
  shadow: string;
}

export const TREE_SKY_NIGHT: TreeSky = {
  a: "#2a3670",
  b: "#19224f",
  c: "#0a102e",
  ink: "#dfe9ff",
  glow: "rgba(165,190,255,0.30)",
  border: "#383468",
  shadow: "rgba(20,16,60,0.25)",
};

export const TREE_SKY_DAY: TreeSky = {
  a: "#f4f8ff",
  b: "#dce9fa",
  c: "#b8cfee",
  ink: "#3d4a80",
  // ハンドオフ原案の rgba(255,214,130,.50) は平塗りだと空に対して唐突
  // だったので、淡く・薄く（シーン側の feGaussianBlur とセットで陽だまり
  // に読める強さへ）
  glow: "rgba(255,228,175,0.38)",
  border: "#cbd6e8",
  shadow: "rgba(60,70,120,0.18)",
};

/**
 * 朝（06-12）の樹。ページの blush に合わせ、淡い桃色から珊瑚色へ。参照
 * デザインのやわらかい面と同じ色域に置いてある。星座カードのように暗く
 * しないのは、こちらは星図ではなく風景で、黒い星の問題を持たないから
 * ——樹の周りは明るいままのほうが「朝」に見える。
 *
 * 樹本体は寒色のままなので、暖色の空との対比で朝の逆光ぎみに見える。
 */
export const TREE_SKY_SUNRISE: TreeSky = {
  a: "#fff2ea",
  b: "#fddac9",
  c: "#f4ab94",
  ink: "#7d3a20",
  glow: "rgba(255,190,150,0.44)",
  border: "#f3c9b5",
  shadow: "rgba(140,60,35,0.18)",
};

export function treeSkyForPeriod(period: TimePeriod): TreeSky {
  if (period.id === "day") return TREE_SKY_SUNRISE;
  if (period.id === "afternoon") return TREE_SKY_DAY;
  return TREE_SKY_NIGHT;
}

function interpolateTreeSky(a: TreeSky, b: TreeSky, t: number): TreeSky {
  if (a === b) return a;
  const keys = Object.keys(a) as (keyof TreeSky)[];
  const result = {} as TreeSky;
  for (const key of keys) {
    result[key] = lerpSkyColor(a[key], b[key], t);
  }
  return result;
}

// --- Time mapping ---

const TRANSITION_DURATION = 60; // seconds
const HALF_TRANSITION = TRANSITION_DURATION / 2;

export function getCurrentPeriodIndex(date: Date): number {
  const h = date.getHours();
  for (let i = 0; i < TIME_PERIODS.length; i++) {
    const p = TIME_PERIODS[i];
    if (h >= p.startHour && h < p.endHour) return i;
  }
  return 0;
}

/**
 * Shared boundary crossfade. `pick` selects which token set to read off a
 * period and `mix` blends two of them; palette and sky both go through here so
 * they can never drift out of step at a boundary.
 */
function blendAtTime<T>(
  date: Date,
  pick: (period: TimePeriod) => T,
  mix: (a: T, b: T, t: number) => T
): T {
  const totalSeconds =
    date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  const idx = getCurrentPeriodIndex(date);
  const period = TIME_PERIODS[idx];
  const boundarySeconds = period.startHour * 3600;

  // Check if we're near the start boundary of the current period
  const distFromBoundary = totalSeconds - boundarySeconds;

  if (distFromBoundary >= 0 && distFromBoundary < HALF_TRANSITION) {
    // In the second half of transition (just entered new period)
    const prevIdx = (idx - 1 + TIME_PERIODS.length) % TIME_PERIODS.length;
    const t = 0.5 + distFromBoundary / TRANSITION_DURATION;
    return mix(pick(TIME_PERIODS[prevIdx]), pick(period), t);
  }

  // Check if we're near the end boundary of the current period
  const endBoundarySeconds = period.endHour * 3600;
  const distToEnd = endBoundarySeconds - totalSeconds;

  if (distToEnd > 0 && distToEnd <= HALF_TRANSITION) {
    // In the first half of transition (about to leave current period).
    // distToEnd 30s -> 0s maps to t 0 -> 0.5, so the branch above resumes at
    // 0.5 on the same pair of palettes and the fade stays continuous.
    const nextIdx = (idx + 1) % TIME_PERIODS.length;
    const t = 0.5 - distToEnd / TRANSITION_DURATION;
    return mix(pick(period), pick(TIME_PERIODS[nextIdx]), t);
  }

  return pick(period);
}

export function getEffectivePalette(date: Date): ThemePalette {
  return blendAtTime(date, (p) => p.palette, interpolatePalettes);
}

export function getEffectiveSky(date: Date): SkyPalette {
  return blendAtTime(date, (p) => p.sky, interpolateSky);
}

/**
 * Day/night crossfades only at the 06:00 and 18:00 boundaries (both sides of
 * the 12:00 / 00:00 boundaries pick the same set, so the mix is a no-op).
 */
export function getEffectiveTreeSky(date: Date): TreeSky {
  return blendAtTime(date, treeSkyForPeriod, interpolateTreeSky);
}

// --- CSS var application ---

const CSS_VAR_MAP: Record<keyof ThemePalette, string> = {
  navy: "--dyn-navy",
  navyLight: "--dyn-navy-light",
  navyLighter: "--dyn-navy-lighter",
  primary: "--dyn-primary",
  primaryDark: "--dyn-primary-dark",
  accent: "--dyn-accent",
  accentDark: "--dyn-accent-dark",
  surface: "--dyn-surface",
  surfaceBorder: "--dyn-surface-border",
  textPrimary: "--dyn-text-primary",
  textSecondary: "--dyn-text-secondary",
  textMuted: "--dyn-text-muted",
  onPrimary: "--dyn-on-primary",
  onAccent: "--dyn-on-accent",
  success: "--dyn-success",
  warning: "--dyn-warning",
  danger: "--dyn-danger",
};

const SKY_VAR_MAP: Record<keyof SkyPalette, string> = {
  a: "--sky-a",
  b: "--sky-b",
  c: "--sky-c",
  ink: "--sky-ink",
  strong: "--sky-strong",
  text: "--sky-text",
  chip: "--sky-chip",
  glow: "--sky-glow",
  line: "--sky-line",
};

const TREE_VAR_MAP: Record<keyof TreeSky, string> = {
  a: "--tree-a",
  b: "--tree-b",
  c: "--tree-c",
  ink: "--tree-ink",
  glow: "--tree-glow",
  border: "--tree-border",
  shadow: "--tree-shadow",
};

// Compute relative luminance (0 = black, 1 = white)
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const srgb = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export const THEME_CHANGE_EVENT = "theme-palette-change";

/**
 * Light/dark flag for the currently applied palette. Chart components use it
 * to pick color sets that SVG attributes can hold (fills can't read var()).
 */
export function getDocumentScheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.colorScheme === "light" ? "light" : "dark";
}

export function applyPalette(
  palette: ThemePalette,
  sky?: SkyPalette,
  treeSky?: TreeSky
): void {
  const style = document.documentElement.style;
  const keys = Object.keys(CSS_VAR_MAP) as (keyof ThemePalette)[];
  for (const key of keys) {
    style.setProperty(CSS_VAR_MAP[key], palette[key]);
  }

  if (treeSky) {
    const treeKeys = Object.keys(TREE_VAR_MAP) as (keyof TreeSky)[];
    for (const key of treeKeys) {
      style.setProperty(TREE_VAR_MAP[key], treeSky[key]);
    }
  }

  if (sky) {
    const skyKeys = Object.keys(SKY_VAR_MAP) as (keyof SkyPalette)[];
    for (const key of skyKeys) {
      style.setProperty(SKY_VAR_MAP[key], sky[key]);
    }
    // The sky is its own surface with its own contrast direction — a cream
    // page can carry a pale sky (light ink) while the night sky stays dark.
    // Charts/art drawn onto the sky read this instead of --color-scheme.
    document.documentElement.dataset.skyScheme =
      luminance(sky.b) > 0.3 ? "light" : "dark";
  }

  document.documentElement.dataset.colorScheme =
    luminance(palette.navy) > 0.3 ? "light" : "dark";

  // Adapt neumorphism shadows based on background luminance
  const lum = luminance(palette.navy);
  if (lum > 0.3) {
    // Light background — stronger highlight, subtle dark shadow
    style.setProperty("--shadow-neu-dark", "rgba(0,0,0,0.12)");
    style.setProperty("--shadow-neu-light", "rgba(255,255,255,0.70)");
  } else if (lum > 0.1) {
    // Medium background
    style.setProperty("--shadow-neu-dark", "rgba(0,0,0,0.25)");
    style.setProperty("--shadow-neu-light", "rgba(255,255,255,0.25)");
  } else {
    // Dark background
    style.setProperty("--shadow-neu-dark", "rgba(0,0,0,0.45)");
    style.setProperty("--shadow-neu-light", "rgba(255,255,255,0.05)");
  }

  // Update theme-color meta tag
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", palette.navy);
  }

  // Notify chart components to re-read CSS vars immediately
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
