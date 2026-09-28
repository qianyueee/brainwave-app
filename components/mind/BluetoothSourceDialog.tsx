"use client";

import { useEffect, useState } from "react";
import { Bluetooth, BluetoothSearching, Check, LoaderCircle, X } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { useBluetoothStore, type BtPhase } from "@/store/useBluetoothStore";
import type { BtDevice } from "@/lib/native/brainlink";
import {
  DEFAULT_DEVICE_NAME,
  connectBluetoothDevice,
  disconnectBluetooth,
  openBluetoothSettings,
  refreshBluetooth,
  requestBluetoothOn,
  requestBluetoothPermission,
  startBluetoothScan,
  stopBluetoothScan,
} from "@/lib/mind/bluetooth-link";
import { useT, type LocalizedText } from "@/lib/i18n";

/**
 * 接続設定（Android アプリの Sync Brain 用）— SourceDialog の置き換え。
 *
 * Web 版の /brain は PC ブリッジとペアリングコードでつなぐが、アプリは手元の
 * Bluetooth で脳波計（BrainLink）に直接つなぐ。視覚文法（トリガーボタン＋モーダル・
 * Esc/背景で閉じる・測定中は触れない・デモへ戻る道）は SourceDialog と同じ。
 * 中身は、つなぐまでに要る順（許可 → Bluetooth オン → 機器を選ぶ）に、いま必要な
 * ものだけを出す。許可ダイアログや「Bluetooth をオンに」は、ここのボタンを押した
 * ときにしか出さない。
 */

const isBrainLink = (d: BtDevice) => /brainlink/i.test(d.name ?? "");

const PHASE_LABEL: Record<BtPhase, LocalizedText> = {
  idle: { ja: "未接続", en: "Not connected" },
  connecting: { ja: "接続中…", en: "Connecting…" },
  pairing: { ja: "ペアリング中…", en: "Pairing…" },
  connected: { ja: "接続済み", en: "Connected" },
  reconnecting: { ja: "再接続中…", en: "Reconnecting…" },
  error: { ja: "未接続", en: "Not connected" },
};

export default function BluetoothSourceDialog() {
  const sourceKind = useMindStore((s) => s.sourceKind);
  const setSourceKind = useMindStore((s) => s.setSourceKind);
  const bridgeOnline = useMindStore((s) => s.bridgeOnline);
  const isRecording = useMindStore((s) => s.isRecording);

  const ready = useBluetoothStore((s) => s.ready);
  const adapter = useBluetoothStore((s) => s.adapter);
  const permissions = useBluetoothStore((s) => s.permissions);
  const bonded = useBluetoothStore((s) => s.bonded);
  const found = useBluetoothStore((s) => s.found);
  const discovering = useBluetoothStore((s) => s.discovering);
  const phase = useBluetoothStore((s) => s.phase);
  const device = useBluetoothStore((s) => s.device);
  const error = useBluetoothStore((s) => s.error);

  const [open, setOpen] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const t = useT();
  // 名乗らない機器に付けた名前（端末に残る日本語）は、英語の画面では Headset と出す。
  const shownName = (name: string) => (name === DEFAULT_DEVICE_NAME ? t(DEFAULT_DEVICE_NAME, "Headset") : name);

  const realtime = sourceKind === "realtime";

  // 開くたび・アプリに戻るたびに取り直す（設定アプリで許可や Bluetooth を変えてきた直後）。
  useEffect(() => {
    if (!open) return;
    void refreshBluetooth().catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshBluetooth().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void stopBluetoothScan();
    };
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

  // 「接続する」＝接続の意思表示なので、押した時点でリアルタイムに切り替える（Web 版と
  // 同じ）。前に繋いだ脳波計があれば、それだけで自動で繋がる。
  const handleTrigger = () => {
    if (!realtime) setSourceKind("realtime");
    setOpen(true);
  };

  const handlePick = (d: BtDevice) => {
    if (!realtime) setSourceKind("realtime");
    void stopBluetoothScan();
    void connectBluetoothDevice(d);
  };

  const handleBackToDemo = () => {
    void disconnectBluetooth();
    setSourceKind("demo");
  };

  const bondedAddresses = new Set(bonded.map((d) => d.address));
  const pairedBrainLinks = bonded.filter(isBrainLink);
  const pairedOthers = bonded.filter((d) => !isBrainLink(d));
  // 近くで見つかった機器：ペアリング済みは上の一覧に出ているので除く。BrainLink を先に。
  const nearby = found
    .filter((d) => !bondedAddresses.has(d.address))
    .sort((a, b) => Number(isBrainLink(b)) - Number(isBrainLink(a)));

  const needsPermission = ready && adapter !== "unsupported" && permissions?.connect !== "granted";
  const permanentlyDenied = permissions?.connect === "denied";
  const bluetoothOff = ready && !needsPermission && adapter !== "on" && adapter !== "unsupported";
  const usable = ready && adapter === "on" && permissions?.connect === "granted";

  const deviceRow = (d: BtDevice) => {
    const current = device?.address === d.address && phase !== "idle";
    const connected = current && phase === "connected";
    const busy = current && (phase === "connecting" || phase === "pairing" || phase === "reconnecting");
    return (
      <button
        key={d.address}
        onClick={() => handlePick(d)}
        disabled={isRecording || connected || busy}
        className={`w-full min-h-14 px-4 py-2 rounded-2xl flex items-center gap-3 text-left neu-raised-sm neu-press transition-transform disabled:active:scale-100 ${
          connected ? "bg-navy border border-success" : "bg-navy"
        }`}
      >
        <Bluetooth size={20} className={connected ? "text-success shrink-0" : "text-text-secondary shrink-0"} />
        {/* 機器名は省略しない（同じ型番が並ぶと末尾で見分けるので）——長ければ折り返す */}
        <span className="flex-1 min-w-0">
          <span className="block text-base font-bold text-text-primary break-all">{d.name || t("名前のない機器", "Unnamed device")}</span>
          <span className="block text-xs text-text-muted font-mono">{d.address}</span>
        </span>
        <span className="shrink-0 text-sm font-bold text-primary">
          {connected ? (
            <span className="flex items-center gap-1 text-success">
              <Check size={16} />
              {t("接続済み", "Connected")}
            </span>
          ) : busy ? (
            <LoaderCircle size={18} className="animate-spin text-text-secondary" />
          ) : (
            t("接続する", "Connect")
          )}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* Trigger — Web 版の SourceDialog と同じ位置・同じ見た目 */}
      <button
        onClick={handleTrigger}
        disabled={isRecording}
        className={`shrink-0 min-h-12 px-5 rounded-2xl flex items-center justify-center gap-2 text-base font-bold neu-raised-sm neu-press transition-transform disabled:opacity-60 disabled:active:scale-100 ${
          realtime ? "bg-navy text-text-secondary" : "bg-primary text-on-primary"
        }`}
      >
        {realtime ? (
          <>
            {t("接続中", "Connected")}
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${bridgeOnline ? "bg-success" : "bg-text-muted"}`}
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
              <h2 className="text-lg font-bold text-text-primary">{t("接続設定", "Connection settings")}</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label={t("閉じる", "Close")}
                className="w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
              >
                <X size={20} />
              </button>
            </div>

            {!ready && (
              <p className="flex items-center gap-2 text-base text-text-secondary">
                <LoaderCircle size={20} className="animate-spin" />
                {t("Bluetooth を確認しています…", "Checking Bluetooth…")}
              </p>
            )}

            {ready && adapter === "unsupported" && (
              <p className="text-base text-text-secondary">
                {t(
                  "この端末は Bluetooth に対応していないため、脳波計につなげません。",
                  "This device doesn't support Bluetooth, so it can't connect to the headset."
                )}
              </p>
            )}

            {/* ① 許可（Android 12 以降の「付近のデバイス」） */}
            {needsPermission && (
              <div className="flex flex-col gap-3">
                <p className="text-base text-text-primary">
                  {t(
                    "脳波計（BrainLink）とつなぐには、「付近のデバイス」へのアクセスを許可してください。",
                    "To connect to your headset (BrainLink), allow access to “Nearby devices”."
                  )}
                </p>
                {permanentlyDenied ? (
                  <>
                    <p className="text-sm text-text-secondary">
                      {t(
                        "以前に「許可しない」が選ばれています。設定の「権限」から「付近のデバイス」を許可してください。",
                        "“Don't allow” was chosen before. Allow “Nearby devices” under Permissions in Settings."
                      )}
                    </p>
                    <button
                      onClick={() => void openBluetoothSettings("app")}
                      className="min-h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform"
                    >
                      {t("設定を開く", "Open Settings")}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => void requestBluetoothPermission()}
                    className="min-h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform"
                  >
                    {t("許可する", "Allow")}
                  </button>
                )}
              </div>
            )}

            {/* ② Bluetooth がオフ */}
            {bluetoothOff && (
              <div className="flex flex-col gap-3">
                <p className="text-base text-text-primary">{t("Bluetooth がオフになっています。", "Bluetooth is off.")}</p>
                <button
                  onClick={() => void requestBluetoothOn()}
                  className="min-h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform"
                >
                  {t("Bluetooth をオンにする", "Turn on Bluetooth")}
                </button>
              </div>
            )}

            {/* ③ 機器を選ぶ */}
            {usable && (
              <div className="flex flex-col gap-4">
                {/* 状態 */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-3 h-3 rounded-full ${
                        phase === "connected" && bridgeOnline ? "bg-success" : "bg-text-muted"
                      }`}
                    />
                    <p className="text-base text-text-primary">
                      {t(`脳波計：${t(PHASE_LABEL[phase])}`, `Headset: ${t(PHASE_LABEL[phase])}`)}
                      {device && phase !== "idle"
                        ? t(`（${shownName(device.name)}）`, ` (${shownName(device.name)})`)
                        : ""}
                    </p>
                  </div>
                  {phase === "connected" && !bridgeOnline && (
                    <p className="text-sm text-text-secondary">{t("データを待っています…", "Waiting for data…")}</p>
                  )}
                  {phase === "pairing" && (
                    <p className="text-sm text-text-secondary">
                      {t(
                        "端末の画面にペアリングの確認が出ます。PIN を聞かれたら、脳波計の説明書にある番号（多くは 0000）を入力してください。",
                        "Your phone will ask you to confirm the pairing. If it asks for a PIN, enter the number in the headset's manual (usually 0000)."
                      )}
                    </p>
                  )}
                  {error && <p className="text-sm text-warning">{t(error)}</p>}
                </div>

                {/* ペアリング済み */}
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-text-secondary">{t("ペアリング済みの脳波計", "Paired headsets")}</p>
                  {pairedBrainLinks.length > 0 ? (
                    pairedBrainLinks.map((d) => deviceRow(d))
                  ) : (
                    <p className="text-sm text-text-secondary">
                      {t(
                        "まだありません。脳波計の電源を入れて「近くの脳波計を探す」を押してください。",
                        "None yet. Turn on your headset and tap “Find nearby headsets”."
                      )}
                    </p>
                  )}
                  {pairedOthers.length > 0 &&
                    (showOthers ? (
                      pairedOthers.map((d) => deviceRow(d))
                    ) : (
                      <button
                        onClick={() => setShowOthers(true)}
                        className="min-h-12 text-sm text-text-secondary underline"
                      >
                        {t(
                          `ほかの機器も表示（${pairedOthers.length}台）`,
                          `Show other devices (${pairedOthers.length})`
                        )}
                      </button>
                    ))}
                </div>

                {/* 近くを探す */}
                <div className="flex flex-col gap-2 border-t border-surface-border pt-3">
                  {discovering ? (
                    <button
                      onClick={() => void stopBluetoothScan()}
                      disabled={isRecording}
                      className="min-h-12 rounded-2xl bg-navy text-text-secondary text-base font-bold neu-raised-sm neu-press transition-transform flex items-center justify-center gap-2"
                    >
                      <LoaderCircle size={18} className="animate-spin" />
                      {t("探しています…（止める）", "Searching… (stop)")}
                    </button>
                  ) : (
                    <button
                      onClick={() => void startBluetoothScan()}
                      disabled={isRecording}
                      className="min-h-12 rounded-2xl bg-surface border border-primary text-primary text-base font-bold neu-raised-sm neu-press transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <BluetoothSearching size={18} />
                      {t("近くの脳波計を探す", "Find nearby headsets")}
                    </button>
                  )}
                  {nearby.length > 0 && (
                    <p className="text-sm text-text-secondary">
                      {t(
                        "近くで見つかった機器（選ぶと、ペアリングしてから接続します）",
                        "Devices found nearby (choose one to pair and connect)"
                      )}
                    </p>
                  )}
                  {nearby.map((d) => deviceRow(d))}
                  {!discovering && nearby.length === 0 && found.length > 0 && (
                    <p className="text-sm text-text-secondary">
                      {t("新しい機器は見つかりませんでした。", "No new devices were found.")}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* SourceDialog と同じ逃げ道：接続をやめても画面が空にならないよう、
                デモデータへ戻れる（脳波計との接続も切る）。 */}
            {realtime && !isRecording && (
              <button
                onClick={handleBackToDemo}
                className="min-h-12 rounded-2xl bg-navy text-text-secondary text-base font-bold neu-raised-sm neu-press transition-transform"
              >
                {t("デモデータに戻す", "Back to demo data")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
