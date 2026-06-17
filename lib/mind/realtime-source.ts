import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { MindDataSource, MindSourceHandlers } from "./data-source";
import {
  isValidSample,
  MIND_CHANNEL_PREFIX,
  MIND_SAMPLE_EVENT,
  normalizePairingCode,
} from "./types";

/** Bridge counts as online if a sample arrived within this window. */
const SAMPLE_FRESH_MS = 6000;

/**
 * Subscribes to the pairing-code channel the PC bridge publishes to
 * (`eeg:{pairing_code}`, broadcast event "sample", 1 Hz). The code is shared
 * between phone and bridge — no account login is required on either end.
 * Bridge online state combines presence (bridge `.track({ role: "bridge" })`)
 * with a recent-sample heartbeat, since presence from non-JS clients can be
 * unreliable.
 */
export class RealtimeSource implements MindDataSource {
  private channel: RealtimeChannel | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastSampleAt = 0;
  private presenceOnline = false;

  constructor(
    private pairingCode: string,
    private handlers: MindSourceHandlers
  ) {}

  start(): void {
    if (!supabase) {
      this.handlers.onStatus("error", "クラウド接続が未設定です");
      return;
    }
    const code = normalizePairingCode(this.pairingCode);
    if (!code) {
      this.handlers.onStatus("error", "ペアリングコードがありません");
      return;
    }
    this.handlers.onStatus("connecting", "接続中…");

    this.channel = supabase
      .channel(`${MIND_CHANNEL_PREFIX}${code}`, {
        config: { broadcast: { self: false }, presence: { key: "web" } },
      })
      .on("broadcast", { event: MIND_SAMPLE_EVENT }, ({ payload }) => {
        if (isValidSample(payload)) {
          this.lastSampleAt = Date.now();
          this.handlers.onSample(payload);
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = this.channel?.presenceState() ?? {};
        this.presenceOnline = Object.values(state)
          .flat()
          .some((m) => (m as { role?: string }).role === "bridge");
        this.emitBridgeOnline();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          this.handlers.onStatus("connected", "クラウドに接続しました");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.handlers.onStatus("error", "接続に失敗しました。再試行してください");
        } else if (status === "CLOSED") {
          this.handlers.onStatus("idle");
        }
      });

    this.heartbeat = setInterval(() => this.emitBridgeOnline(), 2000);
  }

  stop(): void {
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.channel && supabase) {
      supabase.removeChannel(this.channel);
    }
    this.channel = null;
  }

  private emitBridgeOnline(): void {
    const fresh = Date.now() - this.lastSampleAt < SAMPLE_FRESH_MS;
    this.handlers.onBridgeOnline?.(this.presenceOnline || fresh);
  }
}
