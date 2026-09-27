import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * BrainLink（Bluetooth Classic の SPP）との「バイトの管」＝
 * android/…/BrainLinkPlugin.java。解析はせず、受け取ったバイトを受信時刻付きで
 * 渡すだけ（ThinkGear の解析は lib/mind/thinkgear.ts）。使うのは
 * lib/mind/bluetooth-link.ts だけ。
 *
 * ブラウザで Android 版の画面を開発するときは lib/native/brainlink-web.ts の
 * 替え玉が動く（合成の ThinkGear を流す。そこからの測定は合成データ扱い）。
 */

export type BtPermission = "granted" | "denied" | "prompt" | "prompt-with-rationale";

/** Android の版の違いは畳んである：11 以前は connect が常に granted、scan が位置情報の許可。 */
export interface BrainLinkPermissions {
  connect: BtPermission;
  scan: BtPermission;
}

export type BtAdapterState = "unsupported" | "off" | "turningOn" | "on" | "turningOff";

export interface BtDevice {
  address: string;
  name: string | null;
  bonded: boolean;
}

export type BrainLinkErrorCode =
  | "UNSUPPORTED"
  | "BT_OFF"
  | "PERMISSION_DENIED"
  | "LOCATION_OFF"
  | "NOT_FOUND"
  | "BUSY"
  | "PAIR_FAILED"
  | "CONNECT_FAILED"
  | "IO"
  | "CANCELLED";

export interface BrainLinkConnectionEvent {
  /** pairing＝ペアリング中（システムの画面が出ている）。disconnected に error が無ければ利用者の操作。 */
  state: "pairing" | "connected" | "disconnected";
  address: string;
  error?: BrainLinkErrorCode;
  message?: string;
}

export interface BrainLinkDataEvent {
  /** 受け取ったバイト列（base64）。 */
  data: string;
  /** 受信した時刻（epoch ms）。サンプルの ts になる。 */
  t: number;
}

export interface BrainLinkPlugin {
  getState(): Promise<{ adapter: BtAdapterState; scanNeedsLocation: boolean; locationEnabled: boolean }>;
  checkPermissions(): Promise<BrainLinkPermissions>;
  requestPermissions(options?: { permissions?: ("connect" | "scan")[] }): Promise<BrainLinkPermissions>;
  requestEnable(): Promise<{ enabled: boolean }>;
  openSettings(options: { target: "app" | "bluetooth" | "location" }): Promise<void>;
  getBondedDevices(): Promise<{ devices: BtDevice[] }>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(options: { address: string }): Promise<void>;
  disconnect(): Promise<void>;
  addListener(eventName: "data", listener: (event: BrainLinkDataEvent) => void): Promise<PluginListenerHandle>;
  addListener(
    eventName: "connection",
    listener: (event: BrainLinkConnectionEvent) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "adapterState",
    listener: (event: { adapter: BtAdapterState }) => void
  ): Promise<PluginListenerHandle>;
  addListener(eventName: "deviceFound", listener: (event: BtDevice) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "discoveryFinished", listener: () => void): Promise<PluginListenerHandle>;
}

export const BrainLink = registerPlugin<BrainLinkPlugin>("NeuroSyncBrainLink", {
  web: () => import("./brainlink-web").then((m) => new m.BrainLinkWeb()),
});

/** 本物の装置か（false＝ブラウザでの替え玉。そこからの測定は合成データとして扱う）。 */
export function isRealBrainLink(): boolean {
  return Capacitor.isNativePlatform();
}

/** プラグインの失敗（call.reject のコード）を取り出す。 */
export function brainLinkErrorCode(err: unknown): BrainLinkErrorCode | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? (code as BrainLinkErrorCode) : null;
}
