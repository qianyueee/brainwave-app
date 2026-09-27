import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BrainLinkPermissions, BtAdapterState, BtDevice } from "@/lib/native/brainlink";

/**
 * Android アプリの Sync Brain：脳波計（BrainLink）との Bluetooth 接続の状態。
 * 書くのは lib/mind/bluetooth-link.ts だけ、読むのは BluetoothSourceDialog と
 * BluetoothSource。Web 版では使われない。
 *
 * - phase：idle（繋いでいない）→ connecting / pairing → connected。意図せず切れたら
 *   reconnecting（5秒ごとに繋ぎ直す＝PC ブリッジと同じ）、失敗が続いている間は error
 * - error：画面にそのまま出す日本語
 * 永続しない（正は装置とネイティブ側）。最後に繋いだ機器だけは
 * useBluetoothDeviceStore に残す。
 */
export type BtPhase = "idle" | "connecting" | "pairing" | "connected" | "reconnecting" | "error";

export interface BtTarget {
  address: string;
  name: string;
}

interface BluetoothState {
  /** プラグインを読み込み、最初の状態を取り終えたか。 */
  ready: boolean;
  adapter: BtAdapterState | "unknown";
  permissions: BrainLinkPermissions | null;
  /** Android 11 以前：探すのに位置情報の許可とオンが要る。 */
  scanNeedsLocation: boolean;
  locationEnabled: boolean;
  bonded: BtDevice[];
  found: BtDevice[];
  discovering: boolean;
  phase: BtPhase;
  device: BtTarget | null;
  error: string | null;
  lastSampleAt: number;
  patch: (partial: Partial<Omit<BluetoothState, "patch">>) => void;
}

export const useBluetoothStore = create<BluetoothState>()((set) => ({
  ready: false,
  adapter: "unknown",
  permissions: null,
  scanNeedsLocation: false,
  locationEnabled: true,
  bonded: [],
  found: [],
  discovering: false,
  phase: "idle",
  device: null,
  error: null,
  lastSampleAt: 0,
  patch: (partial) => set(partial),
}));

/** 装置からデータが流れているか（6秒以内にサンプルが来た）。RealtimeSource と同じ判定。 */
export const BT_SAMPLE_FRESH_MS = 6000;

interface BluetoothDeviceState {
  /** 最後に繋いだ機器。Sync Brain を開くと、許可と Bluetooth が揃っていれば自動で繋ぐ。 */
  lastDevice: BtTarget | null;
  setLastDevice: (device: BtTarget | null) => void;
}

export const useBluetoothDeviceStore = create<BluetoothDeviceState>()(
  persist(
    (set) => ({
      lastDevice: null,
      setLastDevice: (device) => set({ lastDevice: device }),
    }),
    { name: "bt-device" }
  )
);
