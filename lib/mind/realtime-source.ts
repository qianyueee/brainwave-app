import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { MindDataSource, MindSourceHandlers } from "./data-source";
import { isValidSample, MIND_CHANNEL_PREFIX, MIND_SAMPLE_EVENT } from "./types";

/** Bridge counts as online if a sample arrived within this window. */
const SAMPLE_FRESH_MS = 6000;

/**
 * Subscribes to the per-user Supabase Realtime channel the PC bridge
 * publishes to (`eeg:{user_id}`, broadcast event "sample", 1 Hz).
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
    private userId: string,
    private handlers: MindSourceHandlers
  ) {}

  start(): void {
    if (!supabase) {
      this.handlers.onStatus("error", "クラウド接続が未設定です");
      return;
    }
    this.handlers.onStatus("connecting", "接続中…");

    this.channel = supabase
      .channel(`${MIND_CHANNEL_PREFIX}${this.userId}`, {
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
