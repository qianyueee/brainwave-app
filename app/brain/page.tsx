"use client";

import { useEffect } from "react";
import { useMindStore } from "@/store/useMindStore";
import { DummySource } from "@/lib/mind/dummy-source";
import { RealtimeSource } from "@/lib/mind/realtime-source";
import { BluetoothSource } from "@/lib/mind/bluetooth-source";
import { LocalSource } from "@/lib/mind/local-source";
import { IS_ANDROID_APP, IS_DESKTOP_APP } from "@/lib/platform";
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
import BluetoothSourceDialog from "@/components/mind/BluetoothSourceDialog";
import DesktopSourceDialog from "@/components/mind/DesktopSourceDialog";
import SubjectSelector from "@/components/mind/SubjectSelector";
import InductionTargetLine from "@/components/mind/InductionTargetLine";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";
import { useT } from "@/lib/i18n";

/**
 * Sync Brain — the live EEG measurement page: mind map, brain art, band meters
 * and the 推移 trend, i.e. only what is happening *right now*. The saved
 * measurements are read elsewhere: 脳特性チャート and 測定の比較 (the per-record
 * 測定者 → 測定データ pickers) on Sync Report (/report), and the calendar on
 * Sync History (/history).
 *
 * Android アプリ（IS_ANDROID_APP）では、リアルタイムの出どころが PC ブリッジ
 * （ペアリングコード → RealtimeSource）ではなく、手元の Bluetooth で直接つないだ
 * 脳波計（BluetoothSource）になり、「接続する」の中身も BluetoothSourceDialog に
 * 替わる。Windows アプリ（IS_DESKTOP_APP）では、同じ PC で動く測定アプリ（Python が
 * COM ポートの BrainLink を読む）のローカル WS（LocalSource）が出どころで、「接続する」は
 * ポート選択の DesktopSourceDialog——旧い /desktop と同じ組み合わせ。どちらでも
 * sourceKind の "realtime" は「実機の脳波（どの経路でも）」の意味のままで、測り終えた後は
 * Web と同じく「取り込む」で残す。
 */
export default function BrainPage() {
  const t = useT();
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
    } else if (IS_ANDROID_APP) {
      source = new BluetoothSource(handlers);
    } else if (IS_DESKTOP_APP) {
      source = new LocalSource(handlers);
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
      <PageHeader
        title="Sync Brain"
        subtitle={t("脳波同期・測定", "Brainwave sync & measurement")}
      />

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
          {IS_ANDROID_APP ? (
            <BluetoothSourceDialog />
          ) : IS_DESKTOP_APP ? (
            <DesktopSourceDialog />
          ) : (
            <SourceDialog />
          )}
          <div className="min-w-0 ml-auto">
            <SubjectSelector />
          </div>
        </div>
        {/* 誘導周波数は測定ボタンの前。手で入れる欄は無く、流しているセッションの
            誘導周波数（無ければ既定の 40Hz）がそのまま Rate の共鳴率の基準になる
            ——何で判定されるかを、押す前に目に入る位置に置く。 */}
        <InductionTargetLine />
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

      {/* Mobile: single column. Desktop: map+meters (left) | art+trend (right).
          どちらの列も「いま」だけを映す：過去の測定一覧はこのページから外し、
          レポート（脳特性チャート・測定の比較）とヒストリーに寄せた。

          デスクトップは列ごとの flex ではなく2×2のグリッドに置く。列を縦に
          積むと、上段の高さが左右で違う（マインドマップは状態テキストが2行、
          ブレインアートは説明1行）ぶんだけ下段のカードがずれて、脳波バランス
          と推移の頭が揃わない。行を共有すれば上段の高い方に合わせて下段が
          同じ高さから始まる。DOM順はモバイルの並び（マップ→バランス→
          アート→推移）のままにして、配置だけ md 以上で指定する。

          下段は `self-stretch` ＋ 中のカードへ `h-full` を渡して、頭だけで
          なく底も揃える（グラフの高さは元々22pxほど違う）。カードは単一の
          div を返すので `[&>div]` で届く。 */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:grid-rows-[auto_auto] md:gap-6 md:items-start">
        {/* マインドマップ（四象限マップ + 状態）— ブレインアートと左右対称 */}
        <section className="flex flex-col gap-3 md:col-start-1 md:row-start-1">
          <h2 className="text-lg font-bold text-text-primary">{t("マインドマップ", "Mind map")}</h2>
          <MindMapCanvas sample={latestSample} boost={zoneBoost} isRecording={isRecording} />
          <MindStatusText sample={latestSample} boost={zoneBoost} gammaBoost={gammaBoost} />
        </section>

        <div className="md:col-start-1 md:row-start-2 md:self-stretch md:[&>div]:h-full">
          <BandEqualizer powers={bandPowers} />
        </div>

        {/* リアルタイム脳波アート（ニューロフィードバック）— マインドマップと左右対称：
            見出し → 正方形キャンバス → 下に説明文 */}
        <section className="flex flex-col gap-3 md:col-start-2 md:row-start-1">
          <h2 className="text-lg font-bold text-text-primary">{t("ブレインアート", "Brain art")}</h2>
          <MindArtCanvas sample={latestSample} boost={zoneBoost} />
          <p className="text-sm text-text-secondary text-center">
            {t(
              "脳波がリアルタイムに幾何学模様として紡ぎ出されます",
              "Your brainwaves are woven into geometric patterns in real time"
            )}
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
