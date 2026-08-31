"use client";

import { create } from "zustand";
import type { DesktopBridgeState } from "@/lib/mind/desktop-bridge";

/**
 * デスクトップ測定アプリ（ローカル WS）の状態ミラー。persist しない——正は
 * Python 側が毎接続・毎変化で送ってくる state 全量スナップショットで、
 * ここは最新の 1 枚を映すだけ。読むのは接続ダイアログ（DesktopSourceDialog）と
 * LocalSource の写像だけ。
 */
interface DesktopBridgeStore {
  /** ローカル WS が繋がっているか（≠ 装置が繋がっているか）。 */
  wsConnected: boolean;
  state: DesktopBridgeState | null;
  /** 直近の log メッセージ（ダイアログの補助行に出す）。 */
  lastLog: string;
  setWsConnected: (v: boolean) => void;
  setBridgeState: (s: DesktopBridgeState) => void;
  setLastLog: (m: string) => void;
}

export const useDesktopBridgeStore = create<DesktopBridgeStore>()((set) => ({
  wsConnected: false,
  state: null,
  lastLog: "",
  // 切断時は state も捨てる：古いポート一覧や「接続中」を映し続けない。
  setWsConnected: (v) => set(v ? { wsConnected: true } : { wsConnected: false, state: null }),
  setBridgeState: (s) => set({ state: s }),
  setLastLog: (m) => set({ lastLog: m }),
}));

/**
 * 装置側パイプラインが生きているか＝ /brain の「ブリッジ オンライン」に当たる
 * もの。LocalSource がこれを onBridgeOnline に写すことで、canReceiveData
 * （status==="connected" && bridgeOnline）が Sync Brain と同じ意味で機能する。
 */
export const deviceOnline = (s: Pick<DesktopBridgeStore, "wsConnected" | "state">): boolean =>
  s.wsConnected &&
  s.state !== null &&
  s.state.running &&
  (s.state.mode === "demo" || s.state.serial.status === "connected");
