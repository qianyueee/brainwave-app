"use client";

import { useEffect, useState } from "react";
import { Bluetooth, RefreshCw, X } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { deviceOnline, useDesktopBridgeStore } from "@/store/useDesktopBridgeStore";
import { sendDesktopCommand } from "@/lib/mind/desktop-bridge";
import { useT } from "@/lib/i18n";

/**
 * 接続設定（Windows アプリの /brain と、旧いデスクトップ測定アプリの /desktop 用）
 * — SourceDialog の置き換え。
 *
 * /brain の SourceDialog はペアリングコードを「見せる」だけ（つなぐ相手は
 * クラウドの向こうの PC ブリッジ）だが、ここでは自分自身が装置側なので、
 * 中身は BrainLink のポート選択・接続とデモ切替になる。視覚文法（トリガー
 * ボタン＋モーダル・Esc/背景で閉じる・測定中は触れない）は SourceDialog に
 * 合わせてある。
 *
 * 「デモ」は2種類あるので言葉を分ける：
 * - デモデータ（画面内で生成）＝ /brain と同じ DummySource。装置側と無関係。
 * - 合成データ（実機なしテスト）＝ Python 側のデモパイプライン。CSV 記録や
 *   クラウド配信まで実機と同じ経路を通る。
 */
export default function DesktopSourceDialog() {
  const t = useT();
  const sourceKind = useMindStore((s) => s.sourceKind);
  const setSourceKind = useMindStore((s) => s.setSourceKind);
  const isRecording = useMindStore((s) => s.isRecording);

  const wsConnected = useDesktopBridgeStore((s) => s.wsConnected);
  const bridgeState = useDesktopBridgeStore((s) => s.state);
  const lastLog = useDesktopBridgeStore((s) => s.lastLog);
  const online = useDesktopBridgeStore(deviceOnline);

  const [open, setOpen] = useState(false);
  const [port, setPort] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);

  const realtime = sourceKind === "realtime";
  const serial = bridgeState?.serial ?? null;
  const cloud = bridgeState?.cloud ?? null;
  const running = bridgeState?.running ?? false;
  const mode = bridgeState?.mode ?? null;
  const ports = bridgeState?.ports ?? [];

  // ポートは「ユーザーの明示選択が一覧に生きていればそれ、無ければサーバが
  // 覚えている前回ポート → 一覧の先頭」を描画時に導出する（state を effect で
  // 同期しない——ポート一覧は再スキャンで随時変わる）。
  const effectivePort = (() => {
    if (port && ports.some((p) => p.device === port)) return port;
    if (serial?.port && ports.some((p) => p.device === serial.port)) return serial.port;
    return ports[0]?.device ?? "";
  })();

  // クラウドコードも同じ：ユーザーが触るまではサーバ保存値を映す。
  const effectiveCode = codeTouched ? code : (cloud?.code ?? "");

  // 開くたびにポートを取り直す（挿し直しがいちばん多い操作なので）。
  useEffect(() => {
    if (open) sendDesktopCommand({ type: "scan" });
  }, [open]);

  // Lock body scroll + Escape to close while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const serialRunning = running && mode === "serial";
  const demoRunning = running && mode === "demo";

  const handleConnect = () => {
    if (!effectivePort) return;
    sendDesktopCommand({ type: "connect", port: effectivePort });
    setSourceKind("realtime");
  };
  const handleToggleDemoPipeline = () => {
    if (demoRunning) {
      sendDesktopCommand({ type: "demo", on: false });
    } else {
      sendDesktopCommand({ type: "demo", on: true });
      setSourceKind("realtime");
    }
  };
  const handleToggleCloud = () => {
    if (!cloud) return;
    if (cloud.enabled) {
      sendDesktopCommand({ type: "cloud", on: false });
    } else {
      sendDesktopCommand({ type: "cloud", on: true, code: effectiveCode });
    }
  };

  const serialLabel = !serial
    ? t("未接続", "Not connected")
    : serial.status === "connected"
      ? t("接続", "Connected")
      : serial.status === "connecting"
        ? t("接続中…", "Connecting…")
        : t("未接続", "Not connected");

  return (
    <>
      {/* Trigger — /brain の SourceDialog と同じ位置・同じ見た目 */}
      <button
        onClick={() => setOpen(true)}
        disabled={isRecording}
        className={`shrink-0 min-h-12 px-5 rounded-2xl flex items-center justify-center gap-2 text-base font-bold neu-raised-sm neu-press transition-transform disabled:opacity-60 disabled:active:scale-100 ${
          realtime ? "bg-navy text-text-secondary" : "bg-primary text-on-primary"
        }`}
      >
        {realtime ? (
          <>
            {t("接続中", "Connected")}
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                online ? "bg-success" : "bg-text-muted"
              }`}
            />
          </>
        ) : (
          <>
            {t("接続する", "Connect")}
            <Bluetooth size={18} strokeWidth={2} />
          </>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setOpen(false)}
          role="button"
          aria-label={t("閉じる", "Close")}
        >
          <div
            className="w-full max-w-[420px] mx-4 max-h-[85vh] overflow-y-auto bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-4 neu-raised-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">
                {t("接続設定", "Connection settings")}
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label={t("閉じる", "Close")}
                className="w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
              >
                <X size={20} />
              </button>
            </div>

            {!wsConnected ? (
              <p className="text-base text-text-secondary">
                {t(
                  "測定アプリのサーバに接続できません。アプリを起動し直してください （開発時は ",
                  "Can't connect to the measuring app's server. Please restart the app (for development: "
                )}
                <code className="font-mono">python bridge/desktop_app.py --no-window</code>
                {t("）。", ").")}
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {/* ── BrainLink（シリアル）───────────────────────── */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-text-secondary">
                    {t(
                      "BrainLink ポート（Bluetooth ペアリング済みの機器）",
                      "BrainLink port (a device already paired via Bluetooth)"
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={effectivePort}
                      onChange={(e) => setPort(e.target.value)}
                      disabled={serialRunning}
                      className="flex-1 min-w-0 bg-navy rounded-2xl px-4 min-h-12 text-base text-text-primary neu-inset outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                    >
                      {ports.length === 0 && <option value="">{t("ポートが見つかりません", "No ports found")}</option>}
                      {ports.map((p) => (
                        <option key={p.device} value={p.device}>
                          {p.description ? `${p.device} — ${p.description}` : p.device}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => sendDesktopCommand({ type: "scan" })}
                      aria-label={t("ポートを再取得", "Refresh ports")}
                      title={t("ポートを再取得", "Refresh ports")}
                      className="shrink-0 w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
                    >
                      <RefreshCw size={20} />
                    </button>
                  </div>
                  {serialRunning ? (
                    <button
                      onClick={() => sendDesktopCommand({ type: "disconnect" })}
                      className="min-h-12 rounded-2xl bg-navy text-text-secondary text-base font-bold neu-raised-sm neu-press transition-transform"
                    >
                      {t("切断する", "Disconnect")}
                    </button>
                  ) : (
                    <button
                      onClick={handleConnect}
                      disabled={!effectivePort}
                      className="min-h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform disabled:opacity-60"
                    >
                      {t("このポートに接続する", "Connect to this port")}
                    </button>
                  )}
                </div>

                {/* ── 状態 ─────────────────────────────────────── */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-3 h-3 rounded-full ${
                        serial?.status === "connected" ? "bg-success" : "bg-text-muted"
                      }`}
                    />
                    <p className="text-base text-text-primary">
                      {t(`シリアル：${serialLabel}`, `Serial: ${serialLabel}`)}
                      {serial?.port ? t(`（${serial.port}）`, ` (${serial.port})`) : ""}
                    </p>
                  </div>
                  {serial?.detail && (
                    <p className="text-sm text-text-secondary whitespace-pre-line">
                      {t({ ja: serial.detail, en: serial.detailEn || serial.detail })}
                    </p>
                  )}
                  {running && bridgeState?.csvPath && (
                    <p className="text-xs text-text-muted truncate" title={bridgeState.csvPath}>
                      {t("記録先: ", "Saving to: ")}
                      {bridgeState.csvPath}
                    </p>
                  )}
                  {/* パイプラインは動いているのに画面はデモ表示、という状態
                      （「デモデータに戻す」の後や --demo 起動直後）から受信表示へ
                      戻る唯一の入口。接続/合成データ開始は setSourceKind を伴うが、
                      既に動いているものを「見る」だけの操作が他に無い。 */}
                  {running && !realtime && (
                    <button
                      onClick={() => setSourceKind("realtime")}
                      className="min-h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform"
                    >
                      {t("受信データを表示する", "Show incoming data")}
                    </button>
                  )}
                </div>

                {/* ── 実機なしテスト（Python 側の合成データ）───────── */}
                <div className="flex flex-col gap-1.5 border-t border-surface-border pt-3">
                  <p className="text-sm text-text-secondary">
                    {t(
                      "実機なしテスト — 測定アプリが合成データを送出します（CSV 記録・クラウド配信も実機と同じ経路）",
                      "Test without a device — the measuring app sends synthetic data (CSV recording and cloud streaming work just as with a real device)"
                    )}
                  </p>
                  <button
                    onClick={handleToggleDemoPipeline}
                    className={`min-h-12 rounded-2xl text-base font-bold neu-raised-sm neu-press transition-transform ${
                      demoRunning
                        ? "bg-navy text-text-secondary"
                        : "bg-surface border border-primary text-primary"
                    }`}
                  >
                    {demoRunning
                      ? t("合成データを停止する", "Stop synthetic data")
                      : t("合成データでテストする", "Test with synthetic data")}
                  </button>
                </div>

                {/* ── クラウド同時配信（既定 OFF）──────────────── */}
                <div className="flex flex-col gap-1.5 border-t border-surface-border pt-3">
                  <p className="text-sm text-text-secondary">
                    {t(
                      "クラウド同時配信 — スマホの Sync Brain「接続する」に表示されるペアリングコードを入力すると、 スマホでも同じ測定をリアルタイムに見られます",
                      "Cloud streaming — to watch this measurement live on your phone too, enter the pairing code shown when you tap “Connect” in Sync Brain on your phone"
                    )}
                  </p>
                  <input
                    type="text"
                    value={effectiveCode}
                    onChange={(e) => {
                      setCodeTouched(true);
                      setCode(e.target.value);
                    }}
                    disabled={cloud?.enabled ?? false}
                    placeholder={t("例：AB23-CD45", "e.g. AB23-CD45")}
                    className="w-full bg-navy rounded-2xl px-4 min-h-12 text-base font-mono tracking-widest text-text-primary placeholder:text-text-muted placeholder:font-sans placeholder:tracking-normal outline-none neu-inset focus:ring-1 focus:ring-primary disabled:opacity-60"
                  />
                  <button
                    onClick={handleToggleCloud}
                    disabled={!cloud?.enabled && !effectiveCode.trim()}
                    className={`min-h-12 rounded-2xl text-base font-bold neu-raised-sm neu-press transition-transform disabled:opacity-60 ${
                      cloud?.enabled
                        ? "bg-navy text-text-secondary"
                        : "bg-surface border border-primary text-primary"
                    }`}
                  >
                    {cloud?.enabled
                      ? t("配信を停止する", "Stop streaming")
                      : t("配信を開始する", "Start streaming")}
                  </button>
                  {cloud?.enabled && (
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block w-3 h-3 rounded-full ${
                          cloud.connected ? "bg-success" : "bg-text-muted"
                        }`}
                      />
                      <p className="text-base text-text-primary">
                        {cloud.connected
                          ? t("クラウド：配信中", "Cloud: Streaming")
                          : t("クラウド：接続中…", "Cloud: Connecting…")}
                      </p>
                    </div>
                  )}
                </div>

                {lastLog && <p className="text-xs text-text-muted">{t(lastLog)}</p>}
              </div>
            )}

            {/* SourceDialog と同じ逃げ道：接続をやめても画面が空にならないよう、
                画面内生成のデモデータへ戻れる。装置側パイプラインは触らない
                （装置の接続/切断は上の明示ボタンだけが行う）。 */}
            {realtime && !isRecording && (
              <button
                onClick={() => setSourceKind("demo")}
                className="min-h-12 rounded-2xl bg-navy text-text-secondary text-base font-bold neu-raised-sm neu-press transition-transform"
              >
                {t("デモデータに戻す（画面内で生成）", "Back to demo data (generated on screen)")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
