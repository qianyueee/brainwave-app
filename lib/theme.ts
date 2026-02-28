// Time-based dynamic theme system — 10 palettes mapped to circadian rhythm

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
    // 00-03: Reset 無 — 漆黒 (jet black)
    id: "reset",
    name: "無",
    startHour: 0,
    endHour: 3,
    palette: {
      navy: "#020617",
      navyLight: "#0a1025",
      navyLighter: "#131c35",
      primary: "#6366F1",
      primaryDark: "#4F46E5",
      accent: "#818CF8",
      accentDark: "#6366F1",
      surface: "#0e1628",
      surfaceBorder: "#1e2840",
      textPrimary: "#e2e4f0",
      textSecondary: "#8890a8",
      textMuted: "#505870",
    },
  },
  {
    // 03-05: Spiritual 霊 — インディゴ (indigo)
    id: "spiritual",
    name: "霊",
    startHour: 3,
    endHour: 5,
    palette: {
      navy: "#4338CA",
      navyLight: "#4e45d4",
      navyLighter: "#5b52de",
      primary: "#A5B4FC",
      primaryDark: "#818CF8",
      accent: "#C4B5FD",
      accentDark: "#A78BFA",
      surface: "#4a40d0",
      surfaceBorder: "#5e55e0",
      textPrimary: "#eef0ff",
      textSecondary: "#c7caee",
      textMuted: "#9b9ed8",
    },
  },
  {
    // 05-07: Awaken 醒 — ローズレッド (rose red) → soft rose tint
    id: "awaken",
    name: "醒",
    startHour: 5,
    endHour: 7,
    palette: {
      navy: "#f8e8ea",
      navyLight: "#fcf0f2",
      navyLighter: "#f0d8dc",
      primary: "#E11D48",
      primaryDark: "#BE123C",
      accent: "#F97316",
      accentDark: "#EA580C",
      surface: "#faf0f2",
      surfaceBorder: "#e8ccd0",
      textPrimary: "#1c0a10",
      textSecondary: "#88404a",
      textMuted: "#a86872",
    },
  },
  {
    // 07-09: Fresh 純 — サンイエロー (sun yellow) → soft warm cream
    id: "fresh",
    name: "純",
    startHour: 7,
    endHour: 9,
    palette: {
      navy: "#faf5e4",
      navyLight: "#fdf8ec",
      navyLighter: "#f0e8d0",
      primary: "#CA8A04",
      primaryDark: "#A16207",
      accent: "#EA580C",
      accentDark: "#C2410C",
      surface: "#fcf9ee",
      surfaceBorder: "#e8dfc0",
      textPrimary: "#1a1408",
      textSecondary: "#6b5c30",
      textMuted: "#918258",
    },
  },
  {
    // 09-12: Focus 集 — スカイブルー (sky blue) → soft sky blue
    id: "focus",
    name: "集",
    startHour: 9,
    endHour: 12,
    palette: {
      navy: "#e6f2fa",
      navyLight: "#f0f7fc",
      navyLighter: "#d4e6f2",
      primary: "#0284C7",
      primaryDark: "#0369A1",
      accent: "#06B6D4",
      accentDark: "#0891B2",
      surface: "#eef6fc",
      surfaceBorder: "#c0d8ea",
      textPrimary: "#082030",
      textSecondary: "#3a6880",
      textMuted: "#6890a0",
    },
  },
  {
    // 12-14: Zenith 頂 — 純白 (pure white) → near-white warm
    id: "zenith",
    name: "頂",
    startHour: 12,
    endHour: 14,
    palette: {
      navy: "#faf9f6",
      navyLight: "#fdfcfa",
      navyLighter: "#f0eee8",
      primary: "#78716C",
      primaryDark: "#57534E",
      accent: "#0EA5E9",
      accentDark: "#0284C7",
      surface: "#ffffff",
      surfaceBorder: "#e0ddd5",
      textPrimary: "#1c1917",
      textSecondary: "#57534E",
      textMuted: "#A8A29E",
    },
  },
  {
    // 14-16: Stable 定 — エメラルド (emerald) → soft mint
    id: "stable",
    name: "定",
    startHour: 14,
    endHour: 16,
    palette: {
      navy: "#e6f5ee",
      navyLight: "#f0faf5",
      navyLighter: "#d4e8de",
      primary: "#059669",
      primaryDark: "#047857",
      accent: "#0D9488",
      accentDark: "#0F766E",
      surface: "#eefaf4",
      surfaceBorder: "#b8d8c8",
      textPrimary: "#082018",
      textSecondary: "#306850",
      textMuted: "#608878",
    },
  },
  {
    // 16-18: Harvest 実 — アンバー (amber) → soft amber
    id: "harvest",
    name: "実",
    startHour: 16,
    endHour: 18,
    palette: {
      navy: "#faf2e2",
      navyLight: "#fcf6ea",
      navyLighter: "#f0e4c8",
      primary: "#D97706",
      primaryDark: "#B45309",
      accent: "#DC2626",
      accentDark: "#B91C1C",
      surface: "#fdf6ec",
      surfaceBorder: "#e4d4a8",
      textPrimary: "#1c1408",
      textSecondary: "#785818",
      textMuted: "#a08848",
    },
  },
  {
    // 18-21: Release 放 — バイオレット (violet)
    id: "release",
    name: "放",
    startHour: 18,
    endHour: 21,
    palette: {
      navy: "#7C3AED",
      navyLight: "#8648f5",
      navyLighter: "#9158fa",
      primary: "#DDD6FE",
      primaryDark: "#C4B5FD",
      accent: "#F9A8D4",
      accentDark: "#F472B6",
      surface: "#8344f0",
      surfaceBorder: "#9960f8",
      textPrimary: "#f5f0ff",
      textSecondary: "#d4c8f8",
      textMuted: "#b0a0e0",
    },
  },
  {
    // 21-00: Heal 癒 — ミッドナイト (midnight indigo)
    id: "heal",
    name: "癒",
    startHour: 21,
    endHour: 24,
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
      textMuted: "#7870a8",
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
    // In the first half of transition (about to leave current period)
    const nextIdx = (idx + 1) % TIME_PERIODS.length;
    const t = 1 - distToEnd / TRANSITION_DURATION;
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

export function applyPalette(palette: ThemePalette): void {
  const style = document.documentElement.style;
  const keys = Object.keys(CSS_VAR_MAP) as (keyof ThemePalette)[];
  for (const key of keys) {
    style.setProperty(CSS_VAR_MAP[key], palette[key]);
  }

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
}
