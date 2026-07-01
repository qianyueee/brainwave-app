"use client";

import { useEffect } from "react";
import { useMindStore } from "@/store/useMindStore";
import { DummySource } from "@/lib/mind/dummy-source";
import { RealtimeSource } from "@/lib/mind/realtime-source";
import type { MindDataSource, MindSourceHandlers } from "@/lib/mind/data-source";
import { rawBandPowers, EMPTY_BAND_POWERS } from "@/lib/mind/types";
import MindMapCanvas from "@/components/mind/MindMapCanvas";
import MindArtCanvas from "@/components/mind/MindArtCanvas";
import MindStatusText from "@/components/mind/MindStatusText";
import BandEqualizer from "@/components/mind/BandEqualizer";
import BrainBandPie from "@/components/BrainBandPie";
import MindTrendChart from "@/components/mind/MindTrendChart";
import MindRecorder from "@/components/mind/MindRecorder";
import SourceDialog from "@/components/mind/SourceDialog";
import SessionList from "@/components/mind/SessionList";

export default function MindPage() {
  const sourceKind = useMindStore((s) => s.sourceKind);
  const latestSample = useMindStore((s) => s.latestSample);
  const history = useMindStore((s) => s.history);
  const pairingCode = useMindStore((s) => s.pairingCode);
  const gammaBoost = useMindStore((s) => s.gammaBoost);
  // Combined gamma + program pull toward the Zone (the displayed position).
  const zoneBoost = useMindStore((s) => s.zoneBoost);

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
      {/* Top bar: 測定 + データソース side by side. */}
      <div className="flex gap-3">
        <div className="flex-1">
          <MindRecorder />
        </div>
        <div className="flex-1">
          <SourceDialog />
        </div>
      </div>

      {/* Mobile: single column. Desktop: map+meters (left) | art+history (right). */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
        <div className="flex flex-col gap-6">
          {/* マインドマップ（四象限マップ + 状態）— ブレインアートと左右対称 */}
          <section className="flex flex-col gap-3">
            <h1 className="text-lg font-bold text-text-primary">マインドマップ</h1>
            <MindMapCanvas sample={latestSample} boost={zoneBoost} />
            <MindStatusText sample={latestSample} boost={zoneBoost} gammaBoost={gammaBoost} />
          </section>

          <BandEqualizer sample={latestSample} />

          {/* 8種類の脳波バランス（割合の円グラフ・リアルタイム） */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-text-primary">8種類の脳波の割合</h2>
            <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
              <BrainBandPie
                powers={latestSample ? rawBandPowers(latestSample) : EMPTY_BAND_POWERS}
              />
            </div>
          </section>

          <MindTrendChart history={history} />
        </div>

        <div className="flex flex-col gap-6">
          {/* リアルタイム脳波アート（ニューロフィードバック）— マインドマップと左右対称：
              見出し → 正方形キャンバス → 下に説明文 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-text-primary">ブレインアート</h2>
            <MindArtCanvas sample={latestSample} boost={zoneBoost} />
            <p className="text-sm text-text-secondary text-center">
              脳波がリアルタイムに幾何学模様として紡ぎ出されます
            </p>
          </section>

          {/* 過去の測定（タップで脳特性チャートを表示） */}
          <SessionList />
        </div>
      </div>
    </div>
  );
}
