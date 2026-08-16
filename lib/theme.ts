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
 * cold slab dropped into a warm page. The sky now follows the time of day, and
 * it flips convention at the same 6/18 boundary the app uses for day vs night
 * (`isNightNow`): by day a pale ground with ink-dark constellation lines (how a
 * printed star chart reads), by night a deep ground with the figure glowing
 * light. The star figures themselves are unchanged; only the ground and the ink
 * move.
 *
 * The two night periods (evening, midnight) therefore both get a dark sky —
 * matching TREE_SKY below, which already splits day/night the same way. Keeping
 * dusk on the daytime convention left the Home hero drawing near-black lines on
 * pale violet while the Sync Tree card right above it showed a starry night, and
 * while the card's own header said 今夜の月星座.
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
    // 06-12: Day 純 — サンイエロー (sun yellow) → warm cream
    id: "day",
    name: "純",
    startHour: 6,
    endHour: 12,
    palette: {
      navy: "#f5e8c0",
      navyLight: "#f8efd0",
      navyLighter: "#d4c488",
      primary: "#9a6c03",
      primaryDark: "#7c5502",
      accent: "#c04a08",
      accentDark: "#a03c06",
      surface: "#f6ecc8",
      surfaceBorder: "#d8c890",
      textPrimary: "#1a1408",
      textSecondary: "#5c4e20",
      textMuted: "#6b5c28",
      onPrimary: "#ffffff",
      onAccent: "#ffffff",
      // Deepened status hues — the defaults were picked against dark navy
      // and washed out on this cream background
      success: "#166534",
      warning: "#9a3412",
      danger: "#991b1b",
    },
    // Morning sky — pale blue ground, ink-dark constellation lines (the
    // daylight star-map convention), sun-warm halo
    sky: {
      a: "#f4f8ff",
      b: "#dce9fa",
      c: "#b8cfee",
      ink: "#3d4a80",
      strong: "#1f2547",
      text: "#4a5580",
      chip: "rgba(42,48,85,0.08)",
      glow: "rgba(255,214,130,0.50)",
      line: "rgba(42,48,85,0.15)",
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
    // Clear afternoon — mint-tinted sky so the hero sits in the same family
    // as the surrounding palette
    sky: {
      a: "#eef9f4",
      b: "#cdeade",
      c: "#9fd2bd",
      ink: "#1e5748",
      strong: "#0c2e24",
      text: "#2f6a55",
      chip: "rgba(12,46,36,0.08)",
      glow: "rgba(255,240,180,0.45)",
      line: "rgba(12,46,36,0.15)",
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
 * Backdrop for the Sync Tree scene card (Home). Unlike the 4-way `sky`, the
 * tree design collapses the day parts to two states only: the two day themes
 * (day, afternoon) show a daylight sky, the two night themes (midnight,
 * evening) a starry night — values fixed by the Sync Tree handoff. The tree
 * art itself (foliage/trunk palette) never theme-shifts; only this backdrop,
 * its ink (ground line + sparkles) and the card chrome (border/shadow) do.
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

export function treeSkyForPeriod(period: TimePeriod): TreeSky {
  return period.id === "day" || period.id === "afternoon"
    ? TREE_SKY_DAY
    : TREE_SKY_NIGHT;
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
