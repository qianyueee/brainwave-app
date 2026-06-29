"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, BrainCircuit, Check, ArrowRight } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { computeIndicators, computeBandPowers, eegRowsFromSamples } from "@/lib/brain-profile";
import { formatTime } from "@/lib/utils";

/** Below this many samples (~seconds) the timing-based indicators are unreliable. */
const MIN_IMPORT_SAMPLES = 20;

/**
 * Measurement control for the mind-map page: start/stop the live recording and,
 * once a measurement finishes, import it straight into the 脳特性 (brain
 * characteristics) radar chart — no file export/upload round-trip.
 */
export default function MindRecorder() {
  const status = useMindStore((s) => s.status);
  const sourceKind = useMindStore((s) => s.sourceKind);
  const bridgeOnline = useMindStore((s) => s.bridgeOnline);
  const isRecording = useMindStore((s) => s.isRecording);
  const recordingSamples = useMindStore((s) => s.recordingSamples);
  const startRecording = useMindStore((s) => s.startRecording);
  const stopRecording = useMindStore((s) => s.stopRecording);
  const lastRecording = useMindStore((s) => s.lastRecording);
  const imported = useMindStore((s) => s.lastRecordingImported);

  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const addMeasurement = useBrainProfileStore((s) => s.addMeasurement);
  const cloudUserId = useBrainProfileStore((s) => s.cloudUserId);

  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when an import is requested but blocked on login / cloud hydrate; an
  // effect resumes the import once both are ready.
  const [pendingImport, setPendingImport] = useState(false);

  // Realtime needs an online bridge actually sending data; demo is self-feeding.
  const canReceive = status === "connected" && (sourceKind === "demo" || bridgeOnline);
  const sampleCount = lastRecording?.length ?? 0;
  const finished = !isRecording && sampleCount > 0;
  const enoughData = sampleCount >= MIN_IMPORT_SAMPLES;

  const handleImport = useCallback(async () => {
    const samples = useMindStore.getState().lastRecording;
    if (!samples || samples.length < MIN_IMPORT_SAMPLES) return;
    // 脳特性 is saved per account → require login first.
    if (!user) {
      setPendingImport(true);
      openAuthModal("login");
      return;
    }
    // Wait until the account's cloud data has loaded; importing before that
    // races with loadFromCloud, which would overwrite the fresh measurement.
    if (!cloudUserId) {
      setPendingImport(true);
      return;
    }
    setError(null);
    setImporting(true);
    try {
      const rows = eegRowsFromSamples(samples);
      const indicators = computeIndicators(rows);
      const bands = computeBandPowers(rows);
      const tag = `リアルタイム測定 ${new Date().toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`;
      await addMeasurement({ indicators, bands, uploadedAt: new Date().toISOString(), sessionTag: tag });
      useMindStore.getState().markRecordingImported();
      setPendingImport(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setImporting(false);
    }
  }, [user, cloudUserId, openAuthModal, addMeasurement]);

  // Resume a pending import once login + cloud hydrate complete.
  useEffect(() => {
    if (pendingImport && user && cloudUserId && finished && !imported && !importing) {
      handleImport();
    }
  }, [pendingImport, user, cloudUserId, finished, imported, importing, handleImport]);

  // Drop a stale pending request once there's nothing left to import.
  useEffect(() => {
    if (!finished) setPendingImport(false);
  }, [finished]);

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col gap-3">
      {/* Record / stop */}
      <button
        onClick={() => (isRecording ? stopRecording() : startRecording())}
        disabled={!isRecording && !canReceive}
        className={`flex items-center justify-center gap-2 min-h-[56px] rounded-2xl text-lg font-bold transition-colors ${
          isRecording
            ? "bg-red-500/85 text-white neu-press"
            : canReceive
              ? "bg-primary text-white neu-raised-sm"
              : "bg-navy text-text-muted neu-raised-sm opacity-60"
        }`}
      >
        {isRecording ? (
          <>
            <Square size={22} fill="currentColor" />
            測定を終了（{formatTime(recordingSamples.length)}）
          </>
        ) : (
          <>
            <Play size={22} fill="currentColor" />
            測定を開始
          </>
        )}
      </button>

      {!isRecording && !canReceive && !finished && (
        <p className="text-sm text-text-muted text-center">
          {sourceKind === "realtime"
            ? "ブリッジに接続すると測定できます"
            : "データソースに接続すると測定できます"}
        </p>
      )}

      {/* Post-measurement: import into the 脳特性 radar chart */}
      {finished && (
        <div className="flex flex-col gap-2 border-t border-surface-border pt-3">
          <p className="text-base font-bold text-text-primary">
            測定完了（{formatTime(sampleCount)}）
          </p>

          {imported ? (
            <button
              onClick={() => router.push("/profile")}
              className="flex items-center justify-center gap-2 min-h-[52px] rounded-2xl bg-navy text-text-primary text-base font-bold neu-raised-sm neu-press transition-transform"
            >
              <Check size={20} className="text-green-400" />
              脳特性に取り込みました
              <ArrowRight size={18} />
            </button>
          ) : !enoughData ? (
            <p className="text-sm text-text-muted text-center">
              測定が短いため取り込めません（20秒以上の測定が必要です）
            </p>
          ) : (
            <>
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center justify-center gap-2 min-h-[52px] rounded-2xl bg-primary text-white text-base font-bold transition-colors active:scale-[0.98] disabled:opacity-50 neu-raised-sm neu-press"
              >
                <BrainCircuit size={20} strokeWidth={2} />
                {importing ? "取り込み中..." : "脳特性に取り込む"}
              </button>
              <p className="text-xs text-text-muted text-center">
                {!user
                  ? "ログインすると脳特性チャートに反映されます"
                  : pendingImport && !cloudUserId
                    ? "同期の準備中です…"
                    : sampleCount < 60
                      ? "この測定結果を6指標に反映します（1分以上の測定を推奨）"
                      : "この測定結果を脳特性チャートの6指標に反映します"}
              </p>
            </>
          )}
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        </div>
      )}
    </div>
  );
}
