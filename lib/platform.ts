/**
 * Android アプリ（Capacitor）向けのビルドかどうか。
 *
 * `pnpm build:android`（scripts/build-android.mjs）だけが
 * NEXT_PUBLIC_APP_PLATFORM=android を焼き込む。**ビルド時の定数**なのが要点：
 * - 静的書き出しの HTML もこの値で描かれるので、初回描画とハイドレーションが
 *   一致する（実行時に Capacitor を見て分岐すると、SSR の HTML は Web 版の
 *   まま・クライアントは Android 版を描いて mismatch になる）。
 * - Web（GitHub Pages）ビルドでは false。`if (IS_ANDROID_APP)` の中の動的 import
 *   （lib/native/ ＝ Capacitor のプラグイン）は実行されないので、Web 版の画面は
 *   Capacitor のコードを一切読み込まない（チャンクのファイル自体は書き出されるが、
 *   どのページも取りに行かない）。
 *
 * /desktop の判定（lib/desktop.ts の isDesktopRoute）が pathname なのに対し、
 * こちらはページではなく「どの殻の中で動いているか」なのでビルドで決める。
 */
export const IS_ANDROID_APP = process.env.NEXT_PUBLIC_APP_PLATFORM === "android";

/**
 * Windows アプリ（bridge/desktop_app.py の WebView2 が開く完全版）向けのビルドか。
 * `pnpm build:desktop`（scripts/build-desktop.mjs）だけが NEXT_PUBLIC_APP_PLATFORM=desktop を
 * 焼き込む。理由は IS_ANDROID_APP と同じ（ビルド時の定数ならハイドレーションが一致する）。
 * Sync Brain の出どころ（PC の COM ポートを読む Python の管線 → ローカル WS → LocalSource）、
 * Google ログイン（既定のブラウザ＋ループバック）、画面全体で保つローカル WS
 * （DesktopAppShell）がこれで切り替わる。
 */
export const IS_DESKTOP_APP = process.env.NEXT_PUBLIC_APP_PLATFORM === "desktop";
