"use client";

import { useEffect } from "react";
import { IS_DESKTOP_APP } from "@/lib/platform";
import { markDesktopFullAppSince } from "@/lib/desktop";
import {
  ensureDesktopBridge,
  releaseDesktopBridge,
  subscribeDesktopAuthCallbacks,
} from "@/lib/mind/desktop-bridge";
import { completeDesktopGoogleLogin } from "@/lib/mind/desktop-google-auth";

// 完全版で初めて開いた時刻は、どの画面が描かれるより先に覚える——ホームの
// 「アカウントに保存しますか？」（AccountSaveBanner）が最初の描画からこれを読む。
if (IS_DESKTOP_APP && typeof window !== "undefined") markDesktopFullAppSince();

/**
 * Windows アプリ（bridge/desktop_app.py の WebView2 が開く完全版）でだけ動く常駐処理。
 * 何も描かない。Web 版では IS_DESKTOP_APP が false に畳まれ、中身ごと消える。
 *
 * - 測定アプリ（同じ PC の Python）とのローカル WS を、アプリを開いている間ずっと保つ。
 *   接続ダイアログのポート一覧も、Google ログインの戻り先（state.authCallbackUrl）も
 *   この WS で届くので、Sync Brain を開いていない画面でも繋がっている必要がある。
 * - Google ログインの戻り（既定のブラウザ → Python の /auth/callback → WS）を受け取る。
 *   どの画面でログインを始めても、ここがセッションに引き換える。
 *
 * 旧い測定アプリの /desktop（測定だけの単体画面）は、この2つを自分のページで
 * していた。完全版ではそのページを開かない。
 */
export default function DesktopAppShell() {
  useEffect(() => {
    if (!IS_DESKTOP_APP) return;
    ensureDesktopBridge();
    const unsubscribe = subscribeDesktopAuthCallbacks((ev) => void completeDesktopGoogleLogin(ev));
    return () => {
      unsubscribe();
      releaseDesktopBridge();
    };
  }, []);

  return null;
}
