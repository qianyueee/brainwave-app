"use client";

import { Play, Square, LogIn } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { useAuthStore } from "@/store/useAuthStore";
import { supabase } from "@/lib/supabase";
import { formatTime } from "@/lib/utils";

export default function SourcePanel() {
  const sourceKind = useMindStore((s) => s.sourceKind);
  const setSourceKind = useMindStore((s) => s.setSourceKind);
  const status = useMindStore((s) => s.status);
  const statusDetail = useMindStore((s) => s.statusDetail);
  const bridgeOnline = useMindStore((s) => s.bridgeOnline);
  const isRecording = useMindStore((s) => s.isRecording);
  const recordingSamples = useMindStore((s) => s.recordingSamples);
  const startRecording = useMindStore((s) => s.startRecording);
  const stopRecording = useMindStore((s) => s.stopRecording);

  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);

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
      ) : !user ? (
        <div className="flex flex-col gap-3">
          <p className="text-base text-text-secondary">
            リアルタイム表示にはログインが必要です
          </p>
          <button
            onClick={() => openAuthModal("login")}
            className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-primary text-white text-base font-medium neu-raised-sm"
          >
            <LogIn size={20} />
            ログイン
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
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
          {statusDetail && (
            <p className="text-sm text-text-secondary">{statusDetail}</p>
          )}
          {!bridgeOnline && (
            <p className="text-sm text-text-secondary">
              PCでブリッジプログラムを起動してください
            </p>
          )}
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
