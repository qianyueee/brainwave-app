import { registerPlugin, WebPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * 再生中の通知（ロック画面の再生・一時停止）と後台再生を受け持つネイティブ側
 * （android/…/NowPlayingPlugin.java ＋ NowPlayingService.java）。
 *
 * WebView には navigator.mediaSession が無いので、Web 版で lib/keep-alive.ts が
 * navigator.mediaSession に渡している内容を、Android ではこちらへ同じ順で渡す。
 * 呼ぶのは lib/keep-alive.ts だけ。
 */
export interface NowPlayingPlugin {
  start(options: { title: string; artist: string; album: string }): Promise<void>;
  setState(options: { state: "playing" | "paused" }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: "action",
    listener: (event: { action: "play" | "pause" }) => void
  ): Promise<PluginListenerHandle>;
}

/** ブラウザで Android 版の画面を開発するとき用の空実装。 */
class NowPlayingWeb extends WebPlugin {
  async start(): Promise<void> {}
  async setState(): Promise<void> {}
  async stop(): Promise<void> {}
}

const NowPlaying = registerPlugin<NowPlayingPlugin>("NeuroSyncNowPlaying", {
  web: () => new NowPlayingWeb(),
});

// 通知・ロック画面・イヤホンのボタン → AudioProvider の resumeSession / pauseSession。
let handlers: { play: () => void; pause: () => void } | null = null;
let listening = false;

function ensureListener(): void {
  if (listening) return;
  listening = true;
  void NowPlaying.addListener("action", ({ action }) => {
    const h = handlers;
    if (!h) return;
    if (action === "play") h.play();
    else h.pause();
  });
}

export function nowPlayingStart(metadata: { title: string; artist: string; album: string }): void {
  NowPlaying.start(metadata).catch(() => {});
}

export function nowPlayingSetState(state: "playing" | "paused" | "none"): void {
  // "none" は Web 版の stopKeepAlive だけが使う（＝stop が続く）。
  if (state === "none") return;
  NowPlaying.setState({ state }).catch(() => {});
}

export function nowPlayingSetHandlers(onPlay: () => void, onPause: () => void): void {
  handlers = { play: onPlay, pause: onPause };
  ensureListener();
}

export function nowPlayingStop(): void {
  handlers = null;
  NowPlaying.stop().catch(() => {});
}
