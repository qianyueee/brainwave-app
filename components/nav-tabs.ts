import {
  Home,
  Music2,
  BrainCircuit,
  ChartColumn,
  History,
} from "lucide-react";

/**
 * Single source for both navigation bars (BottomNav / SideNav).
 * `short` is the compact label for the mobile bottom bar (katakana in
 * Japanese, the short English name in English);
 * `en` + `kana` render as the two-line entry on the desktop rail.
 * `kana` is only the Japanese reading of `en`, so its English side is empty
 * and the English rail shows the single `en` line.
 * `short` / `kana` are LocalizedText ({ ja, en }) — render them with t().
 * Settings is deliberately NOT a tab — it opens from the gear on the
 * home header, and /player opens from the program cards.
 */
export const NAV_TABS = [
  { href: "/", icon: Home, short: { ja: "ホーム", en: "Home" }, en: "Home", kana: { ja: "ホーム", en: "" } },
  { href: "/session", icon: Music2, short: { ja: "セッション", en: "Session" }, en: "Sync Session", kana: { ja: "シンク・セッション", en: "" } },
  { href: "/brain", icon: BrainCircuit, short: { ja: "ブレイン", en: "Brain" }, en: "Sync Brain", kana: { ja: "シンク・ブレイン", en: "" } },
  { href: "/report", icon: ChartColumn, short: { ja: "レポート", en: "Report" }, en: "Sync Report", kana: { ja: "シンク・レポート", en: "" } },
  { href: "/history", icon: History, short: { ja: "ヒストリー", en: "History" }, en: "Sync History", kana: { ja: "シンク・ヒストリー", en: "" } },
] as const;

/** Active when the tab's route (or a sub-route of it) is shown; "/" only matches exactly. */
export const isTabActive = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);
