"use client";

import { useEffect, useState } from "react";
import { Play, Square, X } from "lucide-react";
import { useMindStore, type MindSessionSummary } from "@/store/useMindStore";
import { useImportSession } from "./useImportSession";
import { formatTime } from "@/lib/utils";
import { isLowQuality, signalQualityPct } from "@/lib/brain-profile";
import { useSubjectStore, activeSubject } from "@/store/useSubjectStore";

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

  const subject = useSubjectStore(activeSubject);

  // The just-finished measurement awaiting the import decision.
  const [finished, setFinished] = useState<MindSessionSummary | null>(null);
  const { importSession, statusFor } = useImportSession();

  // Realtime needs an online bridge actually sending data; demo is self-feeding.
  const canReceive = status === "connected" && (sourceKind === "demo" || bridgeOnline);

  const handleToggle = () => {
    if (!isRecording) {
      // Stamped at start, not at stop, so switching subjects mid-run cannot
      // relabel a measurement that is already underway.
      startRecording(subject && { id: subject.id, name: subject.name });
      return;
    }
    const summary = stopRecording();
    // Show the result whenever something was recorded — including a measurement
    // the headset never read, which the dialog explains instead of offering an
    // all-zero import.
    if (summary) setFinished(summary);
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
  // Older sessions predate usableSec; treat them as usable so nothing regresses.
  const usableSec = finished?.usableSec ?? finished?.durationSec ?? 0;
  const unusable = !!finished && usableSec === 0;
  // Enough seconds were lost to poor contact that the scores are worth a caveat.
  // Same threshold the stored record and the 過去の測定 list use.
  const qualityPct = finished
    ? signalQualityPct(usableSec, finished.durationSec)
    : undefined;
  const patchy = !!finished && !unusable && isLowQuality(qualityPct);

  return (
    <>
      <button
        onClick={handleToggle}
        disabled={!isRecording && !canReceive}
        className={`w-full flex items-center justify-center gap-2 min-h-[52px] rounded-2xl text-lg font-bold transition-colors ${
          isRecording
            ? "bg-red-500/85 text-white neu-press"
            : canReceive
              ? "bg-primary text-on-primary neu-raised-sm"
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
              <h2 className="text-lg font-bold text-text-primary">
                {unusable ? "測定できませんでした" : "測定が完了しました"}
              </h2>
              <button
                onClick={() => setFinished(null)}
                aria-label="閉じる"
                className="w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
              >
                <X size={20} />
              </button>
            </div>

            {unusable ? (
              <>
                <p className="text-base text-text-secondary">
                  測定時間 {formatTime(finished.durationSec)}
                </p>
                <p className="text-base text-text-primary">
                  ヘッドセットが脳波を読み取れませんでした。電極が額に密着しているか、
                  電源が入っているかをご確認のうえ、もう一度お試しください。
                </p>
                <p className="text-sm text-text-muted">
                  この測定は記録されません（有効なデータが0秒のため）
                </p>
              </>
            ) : (
              <>
                {finished.subjectName && (
                  <p className="text-base text-text-primary font-bold">
                    測定者: {finished.subjectName}
                  </p>
                )}
                <p className="text-base text-text-secondary">
                  測定時間 {formatTime(finished.durationSec)}・集中 {finished.avgAttention}
                  ・リラックス {finished.avgMeditation}・ゾーン率 {finished.flowRatioPct}%
                </p>

                {patchy && (
                  <p className="text-sm text-warning">
                    有効なデータは {formatTime(usableSec)}（{qualityPct}%）でした。
                    装着が不安定だったため、スコアは目安としてご覧ください
                  </p>
                )}

                <p className="text-base text-text-primary">
                  この測定結果を脳特性チャートに取り込みますか？
                </p>
              </>
            )}

            {!unusable && importStatus === "waitingLogin" && (
              <p className="text-sm text-text-muted">ログインすると自動で取り込まれます</p>
            )}
            {!unusable && importStatus === "waitingCloud" && (
              <p className="text-sm text-text-muted">データの同期を待っています…</p>
            )}
            {!unusable && importStatus === "error" && (
              <p className="text-sm text-danger">
                取り込みに失敗しました。通信環境をご確認のうえ、もう一度お試しください
              </p>
            )}

            {unusable ? (
              <button
                onClick={() => setFinished(null)}
                className="min-h-[52px] rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform"
              >
                閉じる
              </button>
            ) : (
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
                  className="flex-1 min-h-[52px] rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform disabled:opacity-60"
                >
                  {importStatus === "busy" ? "取り込み中…" : "取り込む"}
                </button>
              </div>
            )}

            {!unusable && (
              <p className="text-sm text-text-muted">
                あとからでも「過去の測定」をタップすると取り込めます
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
