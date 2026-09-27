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
  },
  // Web 版はピンチズームを意図的に残している（50〜60代の最後の拡大手段。
  // app/layout.tsx の viewport 参照）。Capacitor の既定は無効なので戻す。
  zoomEnabled: true,
  plugins: {
    // 既定の "css" のままにする：ページが viewport-fit=cover を宣言していない
    // （app/layout.tsx）ので、SystemBars はステータスバー・ナビゲーションバー
    // （キーボード表示中は IME）の分だけ decorView に余白を取る——スマホの
    // ブラウザと同じ「バーの間だけがページ」になり、共有 CSS を触らずに済む。
    SystemBars: {
      insetsHandling: "css",
    },
  },
};

export default config;
