import type { MindDataSource, MindSourceHandlers } from "./data-source";
import {
  ensureDesktopBridge,
  releaseDesktopBridge,
  subscribeDesktopSamples,
} from "./desktop-bridge";
import { deviceOnline, useDesktopBridgeStore } from "@/store/useDesktopBridgeStore";

/**
 * デスクトップ測定アプリのローカル WS を MindDataSource に写す薄いアダプタ
 * （/desktop 用）。RealtimeSource と同じ座標系に揃える：
 * - WS が繋がっている        → onStatus("connected")   ＝クラウド接続に相当
 * - 装置パイプラインが生きる → onBridgeOnline(true)     ＝ブリッジ在線に相当
 * こうすると useMindStore の canReceiveData（status==="connected" &&
 * bridgeOnline）が /brain と全く同じ判定で「測定を開始」を制御する。
 *
 * ソケット本体はシングルトン（desktop-bridge.ts）が持つ。stop() は購読を
 * 外して参照を返すだけで、切断そのものはページ側の release と合流して決まる。
 */
export class LocalSource implements MindDataSource {
  private unsubSamples: (() => void) | null = null;
  private unsubStore: (() => void) | null = null;

  constructor(private handlers: MindSourceHandlers) {}

  start(): void {
    ensureDesktopBridge();
    this.unsubSamples = subscribeDesktopSamples((s) => this.handlers.onSample(s));
    const push = () => {
      const st = useDesktopBridgeStore.getState();
      if (st.wsConnected) {
        this.handlers.onStatus("connected", "測定アプリに接続しました");
      } else {
        this.handlers.onStatus("connecting", "測定アプリと接続中…");
      }
      this.handlers.onBridgeOnline?.(deviceOnline(st));
    };
    push();
    this.unsubStore = useDesktopBridgeStore.subscribe(push);
  }

  stop(): void {
    this.unsubSamples?.();
    this.unsubSamples = null;
    this.unsubStore?.();
    this.unsubStore = null;
    releaseDesktopBridge();
  }
}
