import { App } from "@capacitor/app";
import { THEME_CHANGE_EVENT } from "@/lib/theme";
import { AppChrome } from "./app-chrome";

/**
 * Android アプリの常駐処理（components/AndroidAppShell.tsx が起動時に1回だけ呼ぶ）。
 * どれも「スマホの Chrome ならブラウザがやってくれること」を WebView の外で補うだけで、
 * 画面の中身には触らない。戻り値は後片付け。
 */
export async function installAndroidShell(): Promise<() => void> {
  // ── システムバーの色 ──
  // lib/theme.ts の applyPalette は時間帯のパレットに合わせて
  // <meta name="theme-color"> を palette.navy に書き換え、THEME_CHANGE_EVENT を
  // 出す（ThemeProvider が10秒ごと）。スマホの Chrome はこの色でステータスバーを
  // 塗るので、同じ色をネイティブに渡す。アイコンの明暗は data-color-scheme
  // （地が明るい＝light なら暗いアイコン）。回転・ダークモード切替などで端末側が
  // 色を戻したときの塗り直しはネイティブ（AppChromePlugin）が自分でするので、
  // ここは値が変わったときだけ送る。
  let sent = "";
  const syncSystemBars = () => {
    const color = document.querySelector('meta[name="theme-color"]')?.getAttribute("content");
    if (!color) return;
    const lightBackground = document.documentElement.dataset.colorScheme === "light";
    const key = `${color}|${lightBackground}`;
    if (key === sent) return;
    sent = key;
    AppChrome.setSystemBars({ color, lightBackground }).catch(() => {
      sent = "";
    });
  };
  syncSystemBars();
  window.addEventListener(THEME_CHANGE_EVENT, syncSystemBars);

  // ── 端末の「戻る」 ──
  // ブラウザと同じく履歴を1つ戻る。戻る先が無い（最初の画面）ときだけ、アプリを
  // 閉じずに背面へ回す——閉じると WebView ごと終わり、再生中の音が止まる。
  const back = await App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.minimizeApp().catch(() => {});
  });

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, syncSystemBars);
    void back.remove();
  };
}
