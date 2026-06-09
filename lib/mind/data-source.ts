import type { EegSample } from "./types";

export type SourceStatus = "idle" | "connecting" | "connected" | "error";

export interface MindSourceHandlers {
  onSample: (s: EegSample) => void;
  /** `detail` is a Japanese message shown directly in the UI. */
  onStatus: (status: SourceStatus, detail?: string) => void;
  /** Realtime source only: whether the PC bridge is currently online. */
  onBridgeOnline?: (online: boolean) => void;
}

/** A pluggable 1 Hz sample feed (demo random-walk / Supabase Realtime). */
export interface MindDataSource {
  start(): Promise<void> | void;
  stop(): void;
}
