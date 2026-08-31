/**
 * /desktop ＝ デスクトップ測定アプリ（bridge/desktop_app.py の WebView）専用
 * ルートかどうか。このページはアプリの一画面ではなく「単体アプリの全画面」
 * なので、ナビゲーション（BottomNav / SideNav）・MiniPlayer・ランチャー用の
 * 左溝といったアプリの chrome を全部消す。判定はビルドフラグではなく
 * pathname——`pnpm dev` / Pages ビルド / デスクトップ同梱ビルドのどれでも
 * 同じに振る舞い、env の配線が要らない（usePathname() は basePath を含まない
 * のでビルド先にも依存しない）。
 */
export const isDesktopRoute = (pathname: string | null | undefined): boolean =>
  pathname === "/desktop" || !!pathname?.startsWith("/desktop/");
