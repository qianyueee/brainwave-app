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
    // 00-03: Midnight — soft deep navy, calm lavender + sage
    id: "midnight",
    name: "深夜",
    startHour: 0,
    endHour: 3,
    palette: {
      navy: "#0a1020",
      navyLight: "#111828",
      navyLighter: "#1a2238",
      primary: "#9B8EC4",
      primaryDark: "#7E72A8",
      accent: "#7BAE7F",
      accentDark: "#629966",
      surface: "#162030",
      surfaceBorder: "#243048",
      textPrimary: "#d8dce8",
      textSecondary: "#8c94a8",
      textMuted: "#5c6478",
    },
  },
  {
    // 03-05: Pre-dawn — muted indigo, lavender + sage
    id: "indigo",
    name: "未明",
    startHour: 3,
    endHour: 5,
    palette: {
      navy: "#0e0e22",
      navyLight: "#161630",
      navyLighter: "#1e1e42",
      primary: "#A898D0",
      primaryDark: "#8A7CB8",
      accent: "#88B88C",
      accentDark: "#6EA072",
      surface: "#1a1a35",
      surfaceBorder: "#2a2a4a",
      textPrimary: "#ddd8f0",
      textSecondary: "#9892b8",
      textMuted: "#686288",
    },
  },
  {
    // 05-07: Sunrise — warm muted rose, softer tones
    id: "sunrise",
    name: "日の出",
    startHour: 5,
    endHour: 7,
    palette: {
      navy: "#f4e4d8",
      navyLight: "#f8ece2",
      navyLighter: "#e8d4c8",
      primary: "#B07858",
      primaryDark: "#986848",
      accent: "#8AAE7E",
      accentDark: "#72986A",
      surface: "#faf0e8",
      surfaceBorder: "#e0ccc0",
      textPrimary: "#2c1a10",
      textSecondary: "#705848",
      textMuted: "#988878",
    },
  },
  {
    // 07-11: Morning — soft sky blue, muted tones
    id: "morning",
    name: "朝",
    startHour: 7,
    endHour: 11,
    palette: {
      navy: "#e2f0f5",
      navyLight: "#ecf5fa",
      navyLighter: "#d0e2ee",
      primary: "#7090B8",
      primaryDark: "#5878A0",
      accent: "#78A87E",
      accentDark: "#608868",
      surface: "#f0f6fa",
      surfaceBorder: "#c8d8e4",
      textPrimary: "#101e28",
      textSecondary: "#4a6878",
      textMuted: "#789098",
    },
  },
  {
    // 11-14: Midday — warm cream, muted gold
    id: "midday",
    name: "昼",
    startHour: 11,
    endHour: 14,
    palette: {
      navy: "#f5f0e0",
      navyLight: "#faf5ea",
      navyLighter: "#e8e0c8",
      primary: "#A08848",
      primaryDark: "#887438",
      accent: "#80A878",
      accentDark: "#689060",
      surface: "#faf8ee",
      surfaceBorder: "#ddd8c0",
      textPrimary: "#282010",
      textSecondary: "#686040",
      textMuted: "#908868",
    },
  },
  {
    // 14-17: Afternoon — warm amber, muted
    id: "afternoon",
    name: "午後",
    startHour: 14,
    endHour: 17,
    palette: {
      navy: "#f2e8d2",
      navyLight: "#f8eede",
      navyLighter: "#e0d4b8",
      primary: "#A88050",
      primaryDark: "#907040",
      accent: "#7EA87A",
      accentDark: "#669062",
      surface: "#f8f0e0",
      surfaceBorder: "#d8ccb0",
      textPrimary: "#281c10",
      textSecondary: "#685838",
      textMuted: "#908060",
    },
  },
  {
    // 17-19: Sunset — soft rose, muted tones
    id: "sunset",
    name: "夕暮れ",
    startHour: 17,
    endHour: 19,
    palette: {
      navy: "#f0d4d4",
      navyLight: "#f6dede",
      navyLighter: "#e0c0c2",
      primary: "#B86878",
      primaryDark: "#A05868",
      accent: "#7EA87A",
      accentDark: "#669062",
      surface: "#f6e0e0",
      surfaceBorder: "#d8bcc0",
      textPrimary: "#281018",
      textSecondary: "#684048",
      textMuted: "#986878",
    },
  },
  {
    // 19-22: Twilight — cool evening, lavender + sage
    id: "twilight",
    name: "黄昏",
    startHour: 19,
    endHour: 22,
    palette: {
      navy: "#141822",
      navyLight: "#1c2230",
      navyLighter: "#262e40",
      primary: "#9890C0",
      primaryDark: "#7E78A8",
      accent: "#78A880",
      accentDark: "#609068",
      surface: "#1e2438",
      surfaceBorder: "#303848",
      textPrimary: "#dce0ec",
      textSecondary: "#8890a8",
      textMuted: "#586878",
    },
  },
  {
    // 22-24: Night — deep violet, lavender + sage
    id: "violet",
    name: "夜",
    startHour: 22,
    endHour: 24,
    palette: {
      navy: "#100e24",
      navyLight: "#181838",
      navyLighter: "#22204a",
      primary: "#A090C8",
      primaryDark: "#8878B0",
      accent: "#80A888",
      accentDark: "#689070",
      surface: "#1e1c38",
      surfaceBorder: "#2e2c4a",
      textPrimary: "#e0daf0",
      textSecondary: "#9890b8",
      textMuted: "#686080",
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
