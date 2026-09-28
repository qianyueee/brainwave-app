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

/**
 * Windows アプリが完全版（全ページ）として初めて開いた時刻（エポック ms、素の
 * localStorage）。これより前の測定は、旧い測定アプリ（/desktop だけの画面）が
 * 「測り終えたら自動で保存」の約束で溜めたもの——ログインする前に測って宛先が
 * 決まっていない分は、完全版では取り込みの画面に出てこないので、「アカウントに
 * 保存しますか？」（AccountSaveBanner）で尋ねる。これより後の測定は Web・Android と
 * 同じく「取り込む」で残すので、尋ねない（取り込まなかった測定を黙って送らない）。
 */
const FULL_APP_SINCE_KEY = "desktop-full-app-since";

/** 初めて開いた時刻を覚える（DesktopAppShell。2回目以降は何もしない）。 */
export function markDesktopFullAppSince(): void {
  try {
    if (!localStorage.getItem(FULL_APP_SINCE_KEY)) {
      localStorage.setItem(FULL_APP_SINCE_KEY, String(Date.now()));
    }
  } catch {
    // 覚えられなければ、旧い測定を尋ねないだけ
  }
}

export function desktopFullAppSince(): number | null {
  try {
    const v = Number(localStorage.getItem(FULL_APP_SINCE_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
