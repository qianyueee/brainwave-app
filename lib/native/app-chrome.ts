import { registerPlugin, WebPlugin } from "@capacitor/core";

/**
 * アプリの「枠」を触るネイティブ側（android/…/AppChromePlugin.java）。
 * lib/native/ の中身は IS_ANDROID_APP のときだけ動的 import される。
 */
export interface AppChromePlugin {
  /** ステータスバー／ナビゲーションバーの地色と、アイコンの明暗。 */
  setSystemBars(options: { color: string; lightBackground: boolean }): Promise<void>;
  /** 画面を点けっぱなしにするか（脳波計と繋がっている間だけ true）。 */
  setKeepScreenOn(options: { on: boolean }): Promise<void>;
}

/** ブラウザで Android 版の画面を開発するとき用の空実装。 */
class AppChromeWeb extends WebPlugin implements AppChromePlugin {
  async setSystemBars(): Promise<void> {}
  async setKeepScreenOn(): Promise<void> {}
}

export const AppChrome = registerPlugin<AppChromePlugin>("NeuroSyncAppChrome", {
  web: () => new AppChromeWeb(),
});
