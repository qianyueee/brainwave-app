"use client";

import { useEffect, useState } from "react";
import { Play, Square, Copy, Check } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { supabase } from "@/lib/supabase";
import { formatTime } from "@/lib/utils";

export default function SourcePanel() {
  const sourceKind = useMindStore((s) => s.sourceKind);
  const setSourceKind = useMindStore((s) => s.setSourceKind);
  const statusDetail = useMindStore((s) => s.statusDetail);
  const bridgeOnline = useMindStore((s) => s.bridgeOnline);
  const isRecording = useMindStore((s) => s.isRecording);
  const recordingSamples = useMindStore((s) => s.recordingSamples);
  const startRecording = useMindStore((s) => s.startRecording);
  const stopRecording = useMindStore((s) => s.stopRecording);
  const status = useMindStore((s) => s.status);
  const pairingCode = useMindStore((s) => s.pairingCode);
  const ensurePairingCode = useMindStore((s) => s.ensurePairingCode);

  // Generate the code after mount (avoids SSR hydration mismatch).
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    ensurePairingCode();
    setMounted(true);
  }, [ensurePairingCode]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (e.g. insecure context) — user can read it off-screen
    }
  };

  const cloudConfigured = supabase !== null;
  const canReceive = status === "connected";

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col gap-4">
      {/* Source toggle */}
      <div className="flex gap-2">
        {(
          [
            { kind: "demo", label: "デモ" },
            { kind: "realtime", label: "リアルタイム" },
          ] as const
        ).map((opt) => {
          const active = sourceKind === opt.kind;
          return (
            <button
              key={opt.kind}
              onClick={() => setSourceKind(opt.kind)}
              className={`flex-1 min-h-[48px] rounded-xl text-base font-medium transition-colors ${
                active
                  ? "bg-primary text-white neu-press"
                  : "bg-navy text-text-secondary neu-raised-sm"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Connection state */}
      {sourceKind === "demo" ? (
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-navy neu-inset text-text-secondary text-sm font-bold">
            デモデータ表示中
          </span>
        </div>
      ) : !cloudConfigured ? (
        <p className="text-base text-text-secondary">クラウド接続が未設定です</p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Pairing code */}
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-text-secondary">ペアリングコード</p>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-2xl font-bold font-mono tracking-widest text-text-primary tabular-nums">
                {mounted ? pairingCode : "————————"}
              </span>
              <button
                onClick={copyCode}
                aria-label="コードをコピー"
                className="shrink-0 w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
              >
                {copied ? <Check size={20} className="text-green-400" /> : <Copy size={20} />}
              </button>
            </div>
            <p className="text-sm text-text-secondary">
              PCのブリッジに同じコードを入力してください
            </p>
          </div>

          {/* Bridge status */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-3 h-3 rounded-full ${
                bridgeOnline ? "bg-green-400" : "bg-text-muted"
              }`}
            />
            <p className="text-base text-text-primary">
              ブリッジ：{bridgeOnline ? "オンライン" : "オフライン"}
            </p>
          </div>
          {statusDetail && <p className="text-sm text-text-secondary">{statusDetail}</p>}
        </div>
      )}

      {/* Recording */}
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
    </div>
  );
}
