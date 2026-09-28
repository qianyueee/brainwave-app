import type { EegSample } from "./types";

export type SourceStatus = "idle" | "connecting" | "connected" | "error";

export interface MindSourceHandlers {
  onSample: (s: EegSample) => void;
  /** `detail` is a message shown directly in the UI, written in the display
   *  language at the moment it is sent (`translator(getLocale())` in lib/i18n). */
  onStatus: (status: SourceStatus, detail?: string) => void;
  /** Real-headset sources only: whether headset data is actually flowing (the
   *  PC bridge is online / the desktop pipeline runs / the Android app's
   *  Bluetooth link delivered a sample within the last 6 s). */
  onBridgeOnline?: (online: boolean) => void;
}

/** A pluggable 1 Hz sample feed: demo random-walk (DummySource), the PC bridge
 *  via Supabase Realtime (RealtimeSource, /brain on the web), the desktop app's
 *  local WS (LocalSource, /desktop) or Bluetooth straight from the headset
 *  (BluetoothSource, /brain in the Android app). */
export interface MindDataSource {
  start(): Promise<void> | void;
  stop(): void;
}
