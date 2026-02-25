// Time-based dynamic theme system — 9 palettes mapped to circadian rhythm

export interface ThemePalette {
  navy: string;
  navyLight: string;
  navyLighter: string;
  primary: string;
  primaryDark: string;
  accent: string;
  accentDark: string;
  surface: string;
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
    // 00-03: Midnight Blue (cosmic navy) — deep dark
    id: "midnight",
    name: "深夜",
    startHour: 0,
    endHour: 3,
    palette: {
      navy: "#060d1b",
      navyLight: "#0c1628",
      navyLighter: "#142038",
      primary: "#5088e0",
      primaryDark: "#3a6ab8",
      accent: "#7878c0",
      accentDark: "#6060a8",
      surface: "#0e182c",
      textPrimary: "#d0d8e8",
      textSecondary: "#8890a8",
      textMuted: "#5c6478",
    },
  },
  {
    // 03-05: Indigo/Purple (pre-dawn) — deep, saturated purple
    id: "indigo",
    name: "未明",
    startHour: 3,
    endHour: 5,
    palette: {
      navy: "#0e0c28",
      navyLight: "#161438",
      navyLighter: "#221e50",
      primary: "#8a78e8",
      primaryDark: "#7060d0",
      accent: "#b088f0",
      accentDark: "#9870d8",
      surface: "#181640",
      textPrimary: "#ddd6f5",
      textSecondary: "#9a92c0",
      textMuted: "#6a6090",
    },
  },
  {
    // 05-07: Pale Pink/Orange (sunrise) — warm, medium-light
    id: "sunrise",
    name: "日の出",
    startHour: 5,
    endHour: 7,
    palette: {
      navy: "#f2ddd0",
      navyLight: "#f8e8de",
      navyLighter: "#e8ccc0",
      primary: "#e06838",
      primaryDark: "#c85828",
      accent: "#f08850",
      accentDark: "#d87040",
      surface: "#f5e2d6",
      textPrimary: "#2c1508",
      textSecondary: "#7a5040",
      textMuted: "#a08070",
    },
  },
  {
    // 07-11: Sky Blue (clear energy) — bright, crisp
    id: "morning",
    name: "朝",
    startHour: 7,
    endHour: 11,
    palette: {
      navy: "#dceef8",
      navyLight: "#e8f4fc",
      navyLighter: "#c8ddf0",
      primary: "#1888d8",
      primaryDark: "#1070c0",
      accent: "#28b890",
      accentDark: "#20a078",
      surface: "#e2f0fa",
      textPrimary: "#0a1e30",
      textSecondary: "#3a6080",
      textMuted: "#6890a8",
    },
  },
  {
    // 11-14: Bright Yellow/White (midday) — warm cream, golden
    id: "midday",
    name: "昼",
    startHour: 11,
    endHour: 14,
    palette: {
      navy: "#faf3dc",
      navyLight: "#fdf8e8",
      navyLighter: "#ece0b8",
      primary: "#d09010",
      primaryDark: "#b87c08",
      accent: "#e8b020",
      accentDark: "#d09818",
      surface: "#fcf5e0",
      textPrimary: "#2a2008",
      textSecondary: "#706028",
      textMuted: "#988850",
    },
  },
  {
    // 14-17: Golden Amber (afternoon) — warm amber
    id: "afternoon",
    name: "午後",
    startHour: 14,
    endHour: 17,
    palette: {
      navy: "#f5e4c8",
      navyLight: "#faecd6",
      navyLighter: "#e4d0a8",
      primary: "#d08018",
      primaryDark: "#b86c10",
      accent: "#e89830",
      accentDark: "#d08020",
      surface: "#f8e8d0",
      textPrimary: "#2a1808",
      textSecondary: "#705828",
      textMuted: "#988048",
    },
  },
  {
    // 17-19: Magenta/Crimson (sunset) — warm rose, vivid
    id: "sunset",
    name: "夕暮れ",
    startHour: 17,
    endHour: 19,
    palette: {
      navy: "#f0ccd0",
      navyLight: "#f8d8dc",
      navyLighter: "#e0b8be",
      primary: "#d04060",
      primaryDark: "#b83050",
      accent: "#e86048",
      accentDark: "#d04838",
      surface: "#f4d2d6",
      textPrimary: "#2a0810",
      textSecondary: "#783848",
      textMuted: "#a06878",
    },
  },
  {
    // 19-22: Twilight Grey/Indigo (evening) — cooling down, medium-dark
    id: "twilight",
    name: "黄昏",
    startHour: 19,
    endHour: 22,
    palette: {
      navy: "#141828",
      navyLight: "#1c2238",
      navyLighter: "#283050",
      primary: "#7090d0",
      primaryDark: "#5878b8",
      accent: "#9080c0",
      accentDark: "#7868a8",
      surface: "#1a2030",
      textPrimary: "#dce0f0",
      textSecondary: "#8898b8",
      textMuted: "#586888",
    },
  },
  {
    // 22-24: Deep Violet (rest) — deep, saturated violet
    id: "violet",
    name: "夜",
    startHour: 22,
    endHour: 24,
    palette: {
      navy: "#100830",
      navyLight: "#181040",
      navyLighter: "#241858",
      primary: "#8870e0",
      primaryDark: "#7058c8",
      accent: "#a080d8",
      accentDark: "#8868c0",
      surface: "#1c1040",
      textPrimary: "#e0d8f5",
      textSecondary: "#9890c0",
      textMuted: "#686090",
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
