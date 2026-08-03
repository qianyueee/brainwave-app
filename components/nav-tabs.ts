import {
  Home,
  Music2,
  BrainCircuit,
  ChartColumn,
  History,
} from "lucide-react";

/**
 * Single source for both navigation bars (BottomNav / SideNav).
 * `short` is the compact katakana label for the mobile bottom bar;
 * `en` + `kana` render as the two-line entry on the desktop rail.
 * Settings is deliberately NOT a tab — it opens from the gear on the
 * home header, and /player opens from the program cards.
 */
export const NAV_TABS = [
  { href: "/", icon: Home, short: "ホーム", en: "Home", kana: "ホーム" },
  { href: "/session", icon: Music2, short: "セッション", en: "Sync Session", kana: "シンク・セッション" },
  { href: "/brain", icon: BrainCircuit, short: "ブレイン", en: "Sync Brain", kana: "シンク・ブレイン" },
  { href: "/report", icon: ChartColumn, short: "レポート", en: "Sync Report", kana: "シンク・レポート" },
  { href: "/history", icon: History, short: "ヒストリー", en: "Sync History", kana: "シンク・ヒストリー" },
] as const;

/** Active when the tab's route (or a sub-route of it) is shown; "/" only matches exactly. */
export const isTabActive = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);
