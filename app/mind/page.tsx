"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { DummySource } from "@/lib/mind/dummy-source";
import { RealtimeSource } from "@/lib/mind/realtime-source";
import type { MindDataSource, MindSourceHandlers } from "@/lib/mind/data-source";
import { formatTime } from "@/lib/utils";
import MindMapCanvas from "@/components/mind/MindMapCanvas";
import MindStatusText from "@/components/mind/MindStatusText";
import BandEqualizer from "@/components/mind/BandEqualizer";
import MindTrendChart from "@/components/mind/MindTrendChart";
import SourcePanel from "@/components/mind/SourcePanel";

export default function MindPage() {
  const sourceKind = useMindStore((s) => s.sourceKind);
  const latestSample = useMindStore((s) => s.latestSample);
  const history = useMindStore((s) => s.history);
  const sessions = useMindStore((s) => s.sessions);
  const deleteSession = useMindStore((s) => s.deleteSession);
  const pairingCode = useMindStore((s) => s.pairingCode);

  // Guard persisted session list against SSR hydration mismatch.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Create/destroy the active data source. getState() actions are stable
  // references, so the handlers never go stale.
  useEffect(() => {
    const handlers: MindSourceHandlers = {
      onSample: (s) => useMindStore.getState().pushSample(s),
      onStatus: (status, detail) => useMindStore.getState().setStatus(status, detail),
      onBridgeOnline: (online) => useMindStore.getState().setBridgeOnline(online),
    };
    let source: MindDataSource | null = null;
    if (sourceKind === "demo") {
      source = new DummySource(handlers);
    } else if (pairingCode) {
      source = new RealtimeSource(pairingCode, handlers);
    } else {
      handlers.onStatus("idle");
    }
    source?.start();
    return () => {
      source?.stop();
      useMindStore.getState().setStatus("idle");
      useMindStore.getState().setBridgeOnline(false);
    };
  }, [sourceKind, pairingCode]);

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      <h1 className="text-2xl font-bold text-text-primary">マインドマップ</h1>

      <SourcePanel />

      <MindMapCanvas sample={latestSample} />

      <MindStatusText sample={latestSample} />

      <BandEqualizer sample={latestSample} />

      <MindTrendChart history={history} />

      {/* Past sessions */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-text-primary">過去の測定</h2>
        {!hydrated || sessions.length === 0 ? (
          <p className="text-base text-text-secondary">まだ測定記録がありません</p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-base font-bold text-text-primary">
                  {new Date(s.startedAt).toLocaleString("ja-JP", {
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {s.source === "demo" && (
                    <span className="ml-2 text-xs font-normal text-text-muted">デモ</span>
                  )}
                </p>
                <p className="text-sm text-text-secondary">
                  {formatTime(s.durationSec)}・集中 {s.avgAttention}・リラックス{" "}
                  {s.avgMeditation}・ゾーン率 {s.flowRatioPct}%
                </p>
              </div>
              <button
                onClick={() => deleteSession(s.id)}
                aria-label="削除"
                className="shrink-0 w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-muted"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
