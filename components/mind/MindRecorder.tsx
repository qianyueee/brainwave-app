"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, BrainCircuit, Check, ArrowRight } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { computeIndicators, eegRowsFromSamples } from "@/lib/brain-profile";
import { formatTime } from "@/lib/utils";

/**
 * Measurement control for the mind-map page: start/stop the live recording and,
 * once a measurement finishes, import it straight into the 脳特性 (brain
 * characteristics) radar chart — no file export/upload round-trip.
 */
export default function MindRecorder() {
  const status = useMindStore((s) => s.status);
  const isRecording = useMindStore((s) => s.isRecording);
  const recordingSamples = useMindStore((s) => s.recordingSamples);
  const startRecording = useMindStore((s) => s.startRecording);
  const stopRecording = useMindStore((s) => s.stopRecording);
  const lastRecording = useMindStore((s) => s.lastRecording);

  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const addMeasurement = useBrainProfileStore((s) => s.addMeasurement);

  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the import state whenever the recording buffer changes (a new
  // measurement starts or finishes), so the "取り込みました" confirmation never
  // leaks onto a different measurement.
  useEffect(() => {
    setImported(false);
    setError(null);
  }, [lastRecording]);

  const canReceive = status === "connected";
  const finished = !isRecording && (lastRecording?.length ?? 0) > 0;

  const handleImport = async () => {
    const samples = useMindStore.getState().lastRecording;
    if (!samples || samples.length === 0) return;
    // 脳特性 is saved per account, so importing requires login.
    if (!user) {
      openAuthModal("login");
      return;
    }
    setError(null);
    setImporting(true);
    try {
      const indicators = computeIndicators(eegRowsFromSamples(samples));
      const tag = `リアルタイム測定 ${new Date().toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`;
      await addMeasurement({
        indicators,
        uploadedAt: new Date().toISOString(),
        sessionTag: tag,
      });
      setImported(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setImporting(false);
    }
  };

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
          データソースに接続すると測定できます
        </p>
      )}

      {/* Post-measurement: import into the 脳特性 radar chart */}
      {finished && (
        <div className="flex flex-col gap-2 border-t border-surface-border pt-3">
          <p className="text-base font-bold text-text-primary">
            測定完了（{formatTime(lastRecording?.length ?? 0)}）
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
                この測定結果を脳特性チャートの6指標に反映します
                {(lastRecording?.length ?? 0) < 60 && "（1分以上の測定を推奨）"}
              </p>
            </>
          )}
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        </div>
      )}
    </div>
  );
}
