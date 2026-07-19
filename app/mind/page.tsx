"use client";

import { useEffect, useMemo } from "react";
import { useMindStore } from "@/store/useMindStore";
import { DummySource } from "@/lib/mind/dummy-source";
import { RealtimeSource } from "@/lib/mind/realtime-source";
import type { MindDataSource, MindSourceHandlers } from "@/lib/mind/data-source";
import { rawBandPowers, EMPTY_BAND_POWERS } from "@/lib/mind/types";
import { computeBandPowers, eegRowsFromSamples } from "@/lib/brain-profile";
import MindMapCanvas from "@/components/mind/MindMapCanvas";
import MindArtCanvas from "@/components/mind/MindArtCanvas";
import MindStatusText from "@/components/mind/MindStatusText";
import BandEqualizer from "@/components/mind/BandEqualizer";
import MindTrendChart from "@/components/mind/MindTrendChart";
import MindRecorder from "@/components/mind/MindRecorder";
import SourceDialog from "@/components/mind/SourceDialog";
import SessionList from "@/components/mind/SessionList";

/** Rolling window (seconds ≈ samples at 1 Hz) for the live 脳波バランス. */
const BALANCE_WINDOW_SEC = 30;

export default function MindPage() {
  const sourceKind = useMindStore((s) => s.sourceKind);
  const latestSample = useMindStore((s) => s.latestSample);
  const history = useMindStore((s) => s.history);
  const pairingCode = useMindStore((s) => s.pairingCode);
  const gammaBoost = useMindStore((s) => s.gammaBoost);
  // Combined gamma + program pull toward the Zone (the displayed position).
  const zoneBoost = useMindStore((s) => s.zoneBoost);
  const isRecording = useMindStore((s) => s.isRecording);
  const recordingSamples = useMindStore((s) => s.recordingSamples);

  // 脳波バランス values. While recording, show a rolling average over the last
  // BALANCE_WINDOW_SEC seconds: smooth (not jumpy like a single sample) yet
  // always moving. A full-session cumulative average would converge and appear
  // frozen after a minute, which read as the bars "not moving". The 脳特性
  // import still summarizes the whole session (computed at stop). Idle: the
  // instantaneous latest sample.
  const bandPowers = useMemo(() => {
    if (isRecording && recordingSamples.length > 0) {
      return computeBandPowers(eegRowsFromSamples(recordingSamples.slice(-BALANCE_WINDOW_SEC)));
    }
    return latestSample ? rawBandPowers(latestSample) : EMPTY_BAND_POWERS;
  }, [isRecording, recordingSamples, latestSample]);

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
            <MindMapCanvas sample={latestSample} boost={zoneBoost} isRecording={isRecording} />
            <MindStatusText sample={latestSample} boost={zoneBoost} gammaBoost={gammaBoost} />
          </section>

          <BandEqualizer
            powers={bandPowers}
            note={isRecording ? "測定中（直近30秒）" : undefined}
          />

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
