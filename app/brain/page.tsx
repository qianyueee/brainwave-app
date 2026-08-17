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
import MindTrendChart from "@/components/mind/MindTrendChart";
import MindRecorder from "@/components/mind/MindRecorder";
import BaselineCheckButton from "@/components/mind/BaselineCheckButton";
import SourceDialog, { SourceStatusLine } from "@/components/mind/SourceDialog";
import SessionList from "@/components/mind/SessionList";
import SubjectSelector from "@/components/mind/SubjectSelector";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";

/**
 * Sync Brain — the live EEG measurement page: mind map, recording, and the
 * past-measurement list. The 脳特性チャート analysis and the measurement
 * comparison live together on Sync Report (/report); importing a measurement
 * from the list below navigates there.
 */
export default function BrainPage() {
  const sourceKind = useMindStore((s) => s.sourceKind);
  const latestSample = useMindStore((s) => s.latestSample);
  const history = useMindStore((s) => s.history);
  const pairingCode = useMindStore((s) => s.pairingCode);
  const gammaBoost = useMindStore((s) => s.gammaBoost);
  // Combined gamma + program pull toward the Zone (the displayed position).
  const zoneBoost = useMindStore((s) => s.zoneBoost);
  const isRecording = useMindStore((s) => s.isRecording);

  // 脳波バランス always shows the instantaneous latest sample so the bars stay
  // live and moving, during recording and idle alike. The 脳特性 import
  // separately summarizes the whole session as a full average (computed at stop).
  const bandPowers = latestSample ? rawBandPowers(latestSample) : EMPTY_BAND_POWERS;

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
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      <PageHeader title="Sync Brain" subtitle="脳波同期・測定" />

      <PageColumn>
      {/* 測定の前にやることを、やる順に3段で置く：
          1) 接続する（＋誰を測るか）2) 測るボタン 3) いま何が流れているか。
          測定者は録音開始時にセッションへ焼き込まれ、履歴もそれで束ねるので、
          必ず測定ボタンより前に見える位置に置く。

          2段目は「10秒チェック」と「測定を開始」の二択。前者は平常時の
          ベースライン（開眼⇄閉眼のBerger応答）、後者は腰を据えた計測——
          長さも目的も違うので、選ばせてから始める。 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <SourceDialog />
          <div className="min-w-0 ml-auto">
            <SubjectSelector />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="w-[42%] shrink-0">
            <BaselineCheckButton />
          </div>
          <div className="flex-1 min-w-0">
            <MindRecorder />
          </div>
        </div>
        <SourceStatusLine />
      </div>

      {/* Mobile: single column. Desktop: map+meters (left) | art+history (right). */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
        <div className="flex flex-col gap-6">
          {/* マインドマップ（四象限マップ + 状態）— ブレインアートと左右対称 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-text-primary">マインドマップ</h2>
            <MindMapCanvas sample={latestSample} boost={zoneBoost} isRecording={isRecording} />
            <MindStatusText sample={latestSample} boost={zoneBoost} gammaBoost={gammaBoost} />
          </section>

          <BandEqualizer powers={bandPowers} />

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

          {/* 過去の測定（タップでシンク・レポートの脳特性チャートへ） */}
          <SessionList />
        </div>
      </div>
      </PageColumn>
    </div>
  );
}
