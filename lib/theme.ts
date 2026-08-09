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

export interface TimePeriod {
  id: string;
  name: string;
  startHour: number;
  endHour: number;
  palette: ThemePalette;
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

export function getEffectivePalette(date: Date): ThemePalette {
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
    return interpolatePalettes(
      TIME_PERIODS[prevIdx].palette,
      period.palette,
      t
    );
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
    return interpolatePalettes(period.palette, TIME_PERIODS[nextIdx].palette, t);
  }

  return period.palette;
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

export function applyPalette(palette: ThemePalette): void {
  const style = document.documentElement.style;
  const keys = Object.keys(CSS_VAR_MAP) as (keyof ThemePalette)[];
  for (const key of keys) {
    style.setProperty(CSS_VAR_MAP[key], palette[key]);
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
