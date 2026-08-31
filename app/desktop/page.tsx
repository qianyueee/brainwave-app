"use client";

import { useEffect } from "react";
import { useMindStore } from "@/store/useMindStore";
import { DummySource } from "@/lib/mind/dummy-source";
import { LocalSource } from "@/lib/mind/local-source";
import { ensureDesktopBridge, releaseDesktopBridge } from "@/lib/mind/desktop-bridge";
import type { MindDataSource, MindSourceHandlers } from "@/lib/mind/data-source";
import { rawBandPowers, EMPTY_BAND_POWERS } from "@/lib/mind/types";
import MindMapCanvas from "@/components/mind/MindMapCanvas";
import MindArtCanvas from "@/components/mind/MindArtCanvas";
import MindStatusText from "@/components/mind/MindStatusText";
import BandEqualizer from "@/components/mind/BandEqualizer";
import MindTrendChart from "@/components/mind/MindTrendChart";
import MindRecorder from "@/components/mind/MindRecorder";
import BaselineCheckButton from "@/components/mind/BaselineCheckButton";
import { SourceStatusLine } from "@/components/mind/SourceDialog";
import DesktopSourceDialog from "@/components/mind/DesktopSourceDialog";
import SubjectSelector from "@/components/mind/SubjectSelector";
import TargetHzInput from "@/components/mind/TargetHzInput";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";

/**
 * デスクトップ測定アプリ（bridge/desktop_app.py の WebView）が開く単体画面。
 * 中身は Sync Brain（/brain）と同じ測定ページで、違いは3点だけ：
 * - データ源：Supabase 経由の RealtimeSource ではなく、同じ PC で動いている
 *   Python 測定アプリのローカル WS（LocalSource）。「接続する」も配対コード
 *   ではなく BrainLink のポート選択（DesktopSourceDialog）。
 * - 取り込み導線なし（MindRecorder allowImport={false}）：/report はログイン＋
 *   クラウド前提で、単体アプリには無い。測定はローカル保存＋CSV に残る。
 * - アプリの chrome（ナビ・MiniPlayer）は isDesktopRoute 守卫で消える。
 *
 * sourceKind の意味はこのページでは「realtime ＝ ローカル装置」。型は増やさない
 * ——canReceiveData・MindSessionSummary.source・persist がそのまま機能し、
 * WebView2 は独自プロファイル（origin も別）なので Web 側の保存値とは衝突しない。
 */
export default function DesktopPage() {
  const sourceKind = useMindStore((s) => s.sourceKind);
  const latestSample = useMindStore((s) => s.latestSample);
  const history = useMindStore((s) => s.history);
  const gammaBoost = useMindStore((s) => s.gammaBoost);
  const zoneBoost = useMindStore((s) => s.zoneBoost);
  const isRecording = useMindStore((s) => s.isRecording);

  const bandPowers = latestSample ? rawBandPowers(latestSample) : EMPTY_BAND_POWERS;

  // 接続ダイアログはデモ表示中でも制御チャネル（ポート一覧・クラウド切替）を
  // 使うので、ページ滞在中はローカル WS を張りっぱなしにする。
  useEffect(() => {
    ensureDesktopBridge();
    return () => releaseDesktopBridge();
  }, []);

  // /brain と同じ形の源ライフサイクル。realtime だけ LocalSource に差し替わる。
  useEffect(() => {
    const handlers: MindSourceHandlers = {
      onSample: (s) => useMindStore.getState().pushSample(s),
      onStatus: (status, detail) => useMindStore.getState().setStatus(status, detail),
      onBridgeOnline: (online) => useMindStore.getState().setBridgeOnline(online),
    };
    const source: MindDataSource =
      sourceKind === "demo" ? new DummySource(handlers) : new LocalSource(handlers);
    source.start();
    return () => {
      source.stop();
      useMindStore.getState().setStatus("idle");
      useMindStore.getState().setBridgeOnline(false);
    };
  }, [sourceKind]);

  return (
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      <PageHeader title="Sync Brain" subtitle="脳波同期・測定" />

      <PageColumn>
      {/* 並びは /brain と同一（操作の習熟がそのまま移るように）。 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <DesktopSourceDialog />
          <div className="min-w-0 ml-auto">
            <SubjectSelector />
          </div>
        </div>
        <TargetHzInput />
        <div className="flex gap-3">
          <div className="w-[42%] shrink-0">
            <BaselineCheckButton />
          </div>
          <div className="flex-1 min-w-0">
            <MindRecorder allowImport={false} />
          </div>
        </div>
        <SourceStatusLine />
      </div>

      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:grid-rows-[auto_auto] md:gap-6 md:items-start">
        <section className="flex flex-col gap-3 md:col-start-1 md:row-start-1">
          <h2 className="text-lg font-bold text-text-primary">マインドマップ</h2>
          <MindMapCanvas sample={latestSample} boost={zoneBoost} isRecording={isRecording} />
          <MindStatusText sample={latestSample} boost={zoneBoost} gammaBoost={gammaBoost} />
        </section>

        <div className="md:col-start-1 md:row-start-2 md:self-stretch md:[&>div]:h-full">
          <BandEqualizer powers={bandPowers} />
        </div>

        <section className="flex flex-col gap-3 md:col-start-2 md:row-start-1">
          <h2 className="text-lg font-bold text-text-primary">ブレインアート</h2>
          <MindArtCanvas sample={latestSample} boost={zoneBoost} />
          <p className="text-sm text-text-secondary text-center">
            脳波がリアルタイムに幾何学模様として紡ぎ出されます
          </p>
        </section>

        <div className="md:col-start-2 md:row-start-2 md:self-stretch md:[&>div]:h-full">
          <MindTrendChart history={history} />
        </div>
      </div>
      </PageColumn>
    </div>
  );
}
