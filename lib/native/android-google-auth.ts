import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import {
  ANDROID_GOOGLE_REDIRECT,
  cancelDesktopGoogleLogin,
  completeDesktopGoogleLogin,
} from "@/lib/mind/desktop-google-auth";
import type { DesktopAuthCallback } from "@/lib/mind/desktop-bridge";
import { useDesktopLoginStore } from "@/store/useDesktopLoginStore";

/**
 * Android アプリの Google ログインの「行き」と「帰り」。手順の本体（PKCE・引き換え・
 * 時間切れ）はデスクトップと共通の lib/mind/desktop-google-auth.ts。
 *
 * - 行き：Custom Tab（@capacitor/browser）でログインページを開く。WebView の中の
 *   ログインは Google が拒む。
 * - 帰り：Supabase が ANDROID_GOOGLE_REDIRECT（アプリの独自スキーム）へ戻し、
 *   Android がアプリを前面に戻して appUrlOpen が届く。プロセスが片付けられていて
 *   冷えた状態から起動し直した場合も、Capacitor はこのイベントを受け手が現れるまで
 *   保持するので、起動時に購読すれば取りこぼさない（lib/native/android-shell.ts）。
 */

export function openGoogleLoginPage(url: string): void {
  Browser.open({ url }).catch(() => {
    // Custom Tab が使えない端末：既定のブラウザへ（Capacitor が外部 URL を回す）。
    window.open(url, "_blank");
  });
}

/** `…://auth/callback?code=…`（エラー時は error / error_code / error_description、
 *  URL の # 側に載ることもある）を読む。 */
function parseCallback(url: string): DesktopAuthCallback {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  new URLSearchParams(parsed.hash.replace(/^#/, "")).forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  return {
    code: params.get("code") ?? undefined,
    error: params.get("error") ?? undefined,
    errorCode: params.get("error_code") ?? undefined,
    description: params.get("error_description") ?? undefined,
  };
}

/** 起動時に1回（android-shell）。戻り値は後片付け。 */
export async function installGoogleLoginReturn(): Promise<() => void> {
  const urlOpen = await App.addListener("appUrlOpen", ({ url }) => {
    if (!url.startsWith(ANDROID_GOOGLE_REDIRECT)) return;
    Browser.close().catch(() => {});
    void completeDesktopGoogleLogin(parseCallback(url));
  });

  // ログインせずにタブを閉じた。成功したときも（アプリが前面に戻るので）同じ通知が
  // 来るが、そのときは直後に appUrlOpen が届いて「引き換え中」に進む。少し待って、
  // まだ「待機中」のときだけ取りやめる。
  const finished = await Browser.addListener("browserFinished", () => {
    setTimeout(() => {
      if (useDesktopLoginStore.getState().status === "waiting") cancelDesktopGoogleLogin();
    }, 1500);
  });

  return () => {
    void urlOpen.remove();
    void finished.remove();
  };
}
