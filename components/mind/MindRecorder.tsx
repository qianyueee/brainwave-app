"use client";

import { Play, Square } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { formatTime } from "@/lib/utils";

/**
 * Record start/stop button for the mind-map top bar. Importing a finished
 * measurement into 脳特性 happens by tapping it in the 過去の測定 list.
 */
export default function MindRecorder() {
  const status = useMindStore((s) => s.status);
  const sourceKind = useMindStore((s) => s.sourceKind);
  const bridgeOnline = useMindStore((s) => s.bridgeOnline);
  const isRecording = useMindStore((s) => s.isRecording);
  const recordingSamples = useMindStore((s) => s.recordingSamples);
  const startRecording = useMindStore((s) => s.startRecording);
  const stopRecording = useMindStore((s) => s.stopRecording);

  // Realtime needs an online bridge actually sending data; demo is self-feeding.
  const canReceive = status === "connected" && (sourceKind === "demo" || bridgeOnline);

  return (
    <button
      onClick={() => (isRecording ? stopRecording() : startRecording())}
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
  );
}
