import type { MindDataSource, MindSourceHandlers, SourceStatus } from "./data-source";
import { activateBluetooth, subscribeBluetoothSamples } from "./bluetooth-link";
import { isValidSample } from "./types";
import { BT_SAMPLE_FRESH_MS, useBluetoothStore } from "@/store/useBluetoothStore";

/**
 * Android アプリの Sync Brain：Bluetooth で直接つないだ脳波計を MindDataSource に写す
 * 薄いアダプタ（接続そのものは lib/mind/bluetooth-link.ts の単一の係が持つ）。
 * LocalSource（/desktop）と同じ座標系に揃える：
 * - 脳波計と繋がっている           → onStatus("connected")  ＝クラウド接続に相当
 * - 6秒以内にサンプルが届いている → onBridgeOnline(true)    ＝ブリッジ在線に相当
 * こうすると useMindStore の canReceiveData が /brain と全く同じ判定で
 * 「測定を開始」「10秒チェック」を制御し、取り込み・アカウントへの保存（source
 * "realtime"）も Web 版の PC ブリッジ経由と同じに扱われる。
 */
export class BluetoothSource implements MindDataSource {
  private release: (() => void) | null = null;
  private unsubSamples: (() => void) | null = null;
  private unsubStore: (() => void) | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastStatus = "";

  constructor(private handlers: MindSourceHandlers) {}

  start(): void {
    this.release = activateBluetooth();
    this.unsubSamples = subscribeBluetoothSamples((s) => {
      if (!isValidSample(s)) return;
      this.handlers.onSample(s);
      this.emitOnline();
    });
    this.pushStatus();
    this.unsubStore = useBluetoothStore.subscribe(() => this.pushStatus());
    // 画面が見えない間はタイマーが間引かれるので、サンプル到着時にも在線を出している。
    this.heartbeat = setInterval(() => this.emitOnline(), 2000);
  }

  stop(): void {
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.unsubSamples?.();
    this.unsubSamples = null;
    this.unsubStore?.();
    this.unsubStore = null;
    this.release?.();
    this.release = null;
  }

  private pushStatus(): void {
    const st = useBluetoothStore.getState();
    const name = st.device?.name ?? "脳波計";
    let status: SourceStatus;
    let detail: string;
    switch (st.phase) {
      case "connected":
        status = "connected";
        detail = `${name} に接続しました`;
        break;
      case "connecting":
        status = "connecting";
        detail = `${name} に接続しています…`;
        break;
      case "pairing":
        status = "connecting";
        detail = "ペアリングしています…画面の案内に従ってください";
        break;
      case "reconnecting":
        status = "connecting";
        detail = st.error ?? "再接続しています…";
        break;
      case "error":
        status = "error";
        detail = st.error ?? "接続できませんでした";
        break;
      default:
        status = "idle";
        detail = "脳波計が接続されていません";
    }
    const key = `${status}|${detail}`;
    if (key !== this.lastStatus) {
      this.lastStatus = key;
      this.handlers.onStatus(status, detail);
    }
    this.emitOnline();
  }

  private emitOnline(): void {
    const st = useBluetoothStore.getState();
    const online = st.phase === "connected" && Date.now() - st.lastSampleAt < BT_SAMPLE_FRESH_MS;
    this.handlers.onBridgeOnline?.(online);
  }
}
