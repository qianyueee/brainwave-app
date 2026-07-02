"use client";

import { useEffect, useState } from "react";
import { Play, Square, X } from "lucide-react";
import { useMindStore, type MindSessionSummary } from "@/store/useMindStore";
import { useImportSession } from "./useImportSession";
import { formatTime } from "@/lib/utils";

/**
 * Record start/stop button for the mind-map top bar. When a measurement
 * finishes, a dialog asks whether to import it into the 脳特性 chart right
 * away; declining is fine — it can still be imported later by tapping the
 * session in the 過去の測定 list.
 */
export default function MindRecorder() {
  const status = useMindStore((s) => s.status);
  const sourceKind = useMindStore((s) => s.sourceKind);
  const bridgeOnline = useMindStore((s) => s.bridgeOnline);
  const isRecording = useMindStore((s) => s.isRecording);
  const recordingSamples = useMindStore((s) => s.recordingSamples);
  const startRecording = useMindStore((s) => s.startRecording);
  const stopRecording = useMindStore((s) => s.stopRecording);

  // The just-finished measurement awaiting the import decision.
  const [finished, setFinished] = useState<MindSessionSummary | null>(null);
  const { importSession, statusFor } = useImportSession();

  // Realtime needs an online bridge actually sending data; demo is self-feeding.
  const canReceive = status === "connected" && (sourceKind === "demo" || bridgeOnline);

  const handleToggle = () => {
    if (!isRecording) {
      startRecording();
      return;
    }
    const summary = stopRecording();
    // Only offer the import when the session carries analysis data.
    if (summary?.indicators && summary.bands) setFinished(summary);
  };

  // Lock body scroll + Escape to close while the dialog is open.
  useEffect(() => {
    if (!finished) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFinished(null);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [finished]);

  const importStatus = finished ? statusFor(finished.id) : "idle";

  return (
    <>
      <button
        onClick={handleToggle}
        disabled={!isRecording && !canReceive}
        className={`w-full flex items-center justify-center gap-2 min-h-[52px] rounded-2xl text-lg font-bold transition-colors ${
          isRecording
            ? "bg-red-500/85 text-white neu-press"
            : canReceive
              ? "bg-primary text-white neu-raised-sm"
              : "bg-navy text-text-muted neu-raised-sm opacity-60"
        }`}
      >
        {isRecording ? (
          <>
            <Square size={20} fill="currentColor" />
            測定を終了（{formatTime(recordingSamples.length)}）
          </>
        ) : (
          <>
            <Play size={20} fill="currentColor" />
            測定を開始
          </>
        )}
      </button>

      {/* Post-measurement prompt: import this measurement into 脳特性? */}
      {finished && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setFinished(null)}
          role="button"
          aria-label="閉じる"
        >
          <div
            className="w-full max-w-[420px] mx-4 bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-4 neu-raised-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">測定が完了しました</h2>
              <button
                onClick={() => setFinished(null)}
                aria-label="閉じる"
                className="w-10 h-10 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-base text-text-secondary">
              測定時間 {formatTime(finished.durationSec)}・集中 {finished.avgAttention}
              ・リラックス {finished.avgMeditation}・ゾーン率 {finished.flowRatioPct}%
            </p>

            <p className="text-base text-text-primary">
              この測定結果を脳特性チャートに取り込みますか？
            </p>

            {importStatus === "waitingLogin" && (
              <p className="text-sm text-text-muted">ログインすると自動で取り込まれます</p>
            )}
            {importStatus === "waitingCloud" && (
              <p className="text-sm text-text-muted">データの同期を待っています…</p>
            )}
            {importStatus === "error" && (
              <p className="text-sm text-red-400">
                取り込みに失敗しました。通信環境をご確認のうえ、もう一度お試しください
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setFinished(null)}
                className="flex-1 min-h-[52px] rounded-2xl bg-navy text-text-secondary text-base font-bold neu-raised-sm neu-press transition-transform"
              >
                あとで
              </button>
              <button
                onClick={() => importSession(finished)}
                disabled={importStatus === "busy" || importStatus === "waitingCloud"}
                className="flex-1 min-h-[52px] rounded-2xl bg-primary text-white text-base font-bold neu-raised-sm neu-press transition-transform disabled:opacity-60"
              >
                {importStatus === "busy" ? "取り込み中…" : "取り込む"}
              </button>
            </div>

            <p className="text-sm text-text-muted">
              あとからでも「過去の測定」をタップすると取り込めます
            </p>
          </div>
        </div>
      )}
    </>
  );
}
