"use client";

import { useEffect, useState } from "react";
import { Bluetooth, RefreshCw, X } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { deviceOnline, useDesktopBridgeStore } from "@/store/useDesktopBridgeStore";
import { sendDesktopCommand } from "@/lib/mind/desktop-bridge";

/**
 * 接続設定（デスクトップ測定アプリ /desktop 用）— SourceDialog の置き換え。
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
    ? "未接続"
    : serial.status === "connected"
      ? "接続"
      : serial.status === "connecting"
        ? "接続中…"
        : "未接続";

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
            接続中
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                online ? "bg-success" : "bg-text-muted"
              }`}
            />
          </>
        ) : (
          <>
            接続する
            <Bluetooth size={18} strokeWidth={2} />
          </>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setOpen(false)}
          role="button"
          aria-label="閉じる"
        >
          <div
            className="w-full max-w-[420px] mx-4 max-h-[85vh] overflow-y-auto bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-4 neu-raised-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">接続設定</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
              >
                <X size={20} />
              </button>
            </div>

            {!wsConnected ? (
              <p className="text-base text-text-secondary">
                測定アプリのサーバに接続できません。アプリを起動し直してください
                （開発時は <code className="font-mono">python bridge/desktop_app.py --no-window</code>）。
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {/* ── BrainLink（シリアル）───────────────────────── */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-text-secondary">
                    BrainLink ポート（Bluetooth ペアリング済みの機器）
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={effectivePort}
                      onChange={(e) => setPort(e.target.value)}
                      disabled={serialRunning}
                      className="flex-1 min-w-0 bg-navy rounded-2xl px-4 min-h-12 text-base text-text-primary neu-inset outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                    >
                      {ports.length === 0 && <option value="">ポートが見つかりません</option>}
                      {ports.map((p) => (
                        <option key={p.device} value={p.device}>
                          {p.description ? `${p.device} — ${p.description}` : p.device}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => sendDesktopCommand({ type: "scan" })}
                      aria-label="ポートを再取得"
                      title="ポートを再取得"
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
                      切断する
                    </button>
                  ) : (
                    <button
                      onClick={handleConnect}
                      disabled={!port}
                      className="min-h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform disabled:opacity-60"
                    >
                      このポートに接続する
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
                      シリアル：{serialLabel}
                      {serial?.port ? `（${serial.port}）` : ""}
                    </p>
                  </div>
                  {serial?.detail && (
                    <p className="text-sm text-text-secondary whitespace-pre-line">{serial.detail}</p>
                  )}
                  {running && bridgeState?.csvPath && (
                    <p className="text-xs text-text-muted truncate" title={bridgeState.csvPath}>
                      記録先: {bridgeState.csvPath}
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
                      受信データを表示する
                    </button>
                  )}
                </div>

                {/* ── 実機なしテスト（Python 側の合成データ）───────── */}
                <div className="flex flex-col gap-1.5 border-t border-surface-border pt-3">
                  <p className="text-sm text-text-secondary">
                    実機なしテスト — 測定アプリが合成データを送出します（CSV 記録・クラウド配信も実機と同じ経路）
                  </p>
                  <button
                    onClick={handleToggleDemoPipeline}
                    className={`min-h-12 rounded-2xl text-base font-bold neu-raised-sm neu-press transition-transform ${
                      demoRunning
                        ? "bg-navy text-text-secondary"
                        : "bg-surface border border-primary text-primary"
                    }`}
                  >
                    {demoRunning ? "合成データを停止する" : "合成データでテストする"}
                  </button>
                </div>

                {/* ── クラウド同時配信（既定 OFF）──────────────── */}
                <div className="flex flex-col gap-1.5 border-t border-surface-border pt-3">
                  <p className="text-sm text-text-secondary">
                    クラウド同時配信 — スマホの Sync Brain「接続する」に表示されるペアリングコードを入力すると、
                    スマホでも同じ測定をリアルタイムに見られます
                  </p>
                  <input
                    type="text"
                    value={effectiveCode}
                    onChange={(e) => {
                      setCodeTouched(true);
                      setCode(e.target.value);
                    }}
                    disabled={cloud?.enabled ?? false}
                    placeholder="例：AB23-CD45"
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
                    {cloud?.enabled ? "配信を停止する" : "配信を開始する"}
                  </button>
                  {cloud?.enabled && (
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block w-3 h-3 rounded-full ${
                          cloud.connected ? "bg-success" : "bg-text-muted"
                        }`}
                      />
                      <p className="text-base text-text-primary">
                        クラウド：{cloud.connected ? "配信中" : "接続中…"}
                      </p>
                    </div>
                  )}
                </div>

                {lastLog && <p className="text-xs text-text-muted">{lastLog}</p>}
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
                デモデータに戻す（画面内で生成）
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
