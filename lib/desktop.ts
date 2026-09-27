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

/**
 * Web 版（GitHub Pages）の URL。デスクトップ測定アプリから「Web版で記録を見る」で
 * 開く先——アプリに保存した記録は Web 版の Sync Report・Sync History で見る。
 * 別の場所に公開するときは NEXT_PUBLIC_WEB_APP_URL で差し替える（末尾は `/`）。
 */
export const WEB_APP_URL =
  process.env.NEXT_PUBLIC_WEB_APP_URL || "https://qianyueee.github.io/brainwave-app/";
