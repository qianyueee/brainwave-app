import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android アプリ（Capacitor）の設定。中身は Web 版と同じ静的書き出しで、
 * `pnpm build:android`（scripts/build-android.mjs）が android-web/ に置いて
 * `cap sync android` で APK の assets へ写す。
 *
 * ⚠ appId と server.androidScheme / hostname は**一度配ったら変えない**。
 * - appId：同じ appId＋同じ署名鍵でしか上書き更新できない。
 * - scheme / hostname：WebView の origin（https://localhost）そのもの。
 *   localStorage・IndexedDB は origin ごとに分かれるので、変えた瞬間に端末内の
 *   記録（未ログインの10秒チェック・振り返り・脳波の測定一覧など）が全部見えなく
 *   なる。デスクトップ測定アプリの HTTP ポート 17860 を固定しているのと同じ理由。
 *   既定値（https / localhost）のまま、ここに明示して固定しておく。
 */
const config: CapacitorConfig = {
  appId: "io.github.qianyueee.neurosync",
  appName: "NeuroSync",
  webDir: "android-web",
  server: {
    androidScheme: "https",
    hostname: "localhost",
    // 下の minWebViewVersion に満たない端末で開くページ（scripts/build-android.mjs が書く）。
    errorPath: "webview-update.html",
  },
  android: {
    // 画面は Chromium 111 以上向けに書き出される（Next.js 16 の既定ターゲット、
    // Tailwind v4 も同じ）。それより古い System WebView だとレイアウトが崩れるので、
    // 開かずに「WebView を更新してください」を出す。
    minWebViewVersion: 111,
  },
  // Web 版はピンチズームを意図的に残している（50〜60代の最後の拡大手段。
  // app/layout.tsx の viewport 参照）。Capacitor の既定は無効なので戻す。
  zoomEnabled: true,
  plugins: {
    // ページが viewport-fit=cover を宣言していない（app/layout.tsx）ので、
    // SystemBars はステータスバー・ナビゲーションバー（キーボード表示中は IME）の
    // 分だけ decorView に余白を取る——スマホのブラウザと同じ「バーの間だけが
    // ページ」になり、共有 CSS を触らずに済む。"native" は使わない
    // --safe-area-inset-* の注入だけを省く（"css" と余白の取り方は同じ）。
    SystemBars: {
      insetsHandling: "native",
    },
  },
};

export default config;
