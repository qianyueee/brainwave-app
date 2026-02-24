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
    id: "midnight",
    name: "深夜",
    startHour: 0,
    endHour: 3,
    palette: {
      navy: "#070e1e",
      navyLight: "#0e1a30",
      navyLighter: "#162440",
      primary: "#4a7fd4",
      primaryDark: "#3a6ab8",
      accent: "#6b6baa",
      accentDark: "#5a5a96",
      surface: "#121e34",
      textPrimary: "#d0d8e8",
      textSecondary: "#8890a8",
      textMuted: "#5c6478",
    },
  },
  {
    id: "indigo",
    name: "未明",
    startHour: 3,
    endHour: 5,
    palette: {
      navy: "#0c0e24",
      navyLight: "#151838",
      navyLighter: "#1f254e",
      primary: "#7c6dd8",
      primaryDark: "#6858c0",
      accent: "#a07cdc",
      accentDark: "#8a68c4",
      surface: "#181c3a",
      textPrimary: "#d5d0ef",
      textSecondary: "#908aae",
      textMuted: "#605a7e",
    },
  },
  {
    id: "sunrise",
    name: "日の出",
    startHour: 5,
    endHour: 7,
    palette: {
      navy: "#1a0e14",
      navyLight: "#281828",
      navyLighter: "#362238",
      primary: "#e88a6e",
      primaryDark: "#d07458",
      accent: "#f0a870",
      accentDark: "#d8925c",
      surface: "#2a1a28",
      textPrimary: "#f2e4de",
      textSecondary: "#b8a098",
      textMuted: "#7e6a62",
    },
  },
  {
    id: "morning",
    name: "朝",
    startHour: 7,
    endHour: 11,
    palette: {
      navy: "#0a1520",
      navyLight: "#122030",
      navyLighter: "#1a2e42",
      primary: "#4da6e0",
      primaryDark: "#3890c8",
      accent: "#52c4a0",
      accentDark: "#40ae8a",
      surface: "#162838",
      textPrimary: "#e8f0f8",
      textSecondary: "#8ea8c0",
      textMuted: "#5e7890",
    },
  },
  {
    id: "midday",
    name: "昼",
    startHour: 11,
    endHour: 14,
    palette: {
      navy: "#141820",
      navyLight: "#1e2230",
      navyLighter: "#282e40",
      primary: "#d4a840",
      primaryDark: "#bc9230",
      accent: "#e0c060",
      accentDark: "#c8a84c",
      surface: "#202430",
      textPrimary: "#f5f0e0",
      textSecondary: "#b0a880",
      textMuted: "#787050",
    },
  },
  {
    id: "afternoon",
    name: "午後",
    startHour: 14,
    endHour: 17,
    palette: {
      navy: "#161008",
      navyLight: "#241c12",
      navyLighter: "#32281c",
      primary: "#d4922a",
      primaryDark: "#bc7e1c",
      accent: "#e8a040",
      accentDark: "#d08c30",
      surface: "#28200e",
      textPrimary: "#f5e8d0",
      textSecondary: "#b0a080",
      textMuted: "#787058",
    },
  },
  {
    id: "sunset",
    name: "夕暮れ",
    startHour: 17,
    endHour: 19,
    palette: {
      navy: "#1a0a12",
      navyLight: "#2a1420",
      navyLighter: "#3a1e2e",
      primary: "#d45a7a",
      primaryDark: "#bc4666",
      accent: "#e87050",
      accentDark: "#d05c3c",
      surface: "#2c1620",
      textPrimary: "#f5dce0",
      textSecondary: "#b8909a",
      textMuted: "#7e5a66",
    },
  },
  {
    id: "twilight",
    name: "黄昏",
    startHour: 19,
    endHour: 22,
    palette: {
      navy: "#0c1018",
      navyLight: "#151c28",
      navyLighter: "#1e2838",
      primary: "#6888c0",
      primaryDark: "#5474aa",
      accent: "#8878b0",
      accentDark: "#74649c",
      surface: "#182030",
      textPrimary: "#dce0ea",
      textSecondary: "#909ab0",
      textMuted: "#606a80",
    },
  },
  {
    id: "violet",
    name: "夜",
    startHour: 22,
    endHour: 24,
    palette: {
      navy: "#0e0a1c",
      navyLight: "#181430",
      navyLighter: "#221e44",
      primary: "#7a68c8",
      primaryDark: "#6654b2",
      accent: "#9070c0",
      accentDark: "#7c5caa",
      surface: "#1a1430",
      textPrimary: "#dcd4f0",
      textSecondary: "#9488b0",
      textMuted: "#645880",
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
  navy: "--color-navy",
  navyLight: "--color-navy-light",
  navyLighter: "--color-navy-lighter",
  primary: "--color-primary",
  primaryDark: "--color-primary-dark",
  accent: "--color-accent",
  accentDark: "--color-accent-dark",
  surface: "--color-surface",
  textPrimary: "--color-text-primary",
  textSecondary: "--color-text-secondary",
  textMuted: "--color-text-muted",
};

export function applyPalette(palette: ThemePalette): void {
  const style = document.documentElement.style;
  const keys = Object.keys(CSS_VAR_MAP) as (keyof ThemePalette)[];
  for (const key of keys) {
    style.setProperty(CSS_VAR_MAP[key], palette[key]);
  }
  // Update theme-color meta tag
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", palette.navy);
  }
}
