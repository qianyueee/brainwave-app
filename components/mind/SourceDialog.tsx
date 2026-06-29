"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Settings2, X } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { supabase } from "@/lib/supabase";

/**
 * Data-source / connection settings, tucked into a dialog so the mind-map page
 * opens straight onto the quadrant chart instead of a big setup panel. The
 * trigger button sits at the bottom of the page and reflects the current
 * source at a glance.
 */
export default function SourceDialog() {
  const sourceKind = useMindStore((s) => s.sourceKind);
  const setSourceKind = useMindStore((s) => s.setSourceKind);
  const statusDetail = useMindStore((s) => s.statusDetail);
  const bridgeOnline = useMindStore((s) => s.bridgeOnline);
  const pairingCode = useMindStore((s) => s.pairingCode);
  const ensurePairingCode = useMindStore((s) => s.ensurePairingCode);

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate the pairing code once on the client. The dialog body (where the
  // code shows) only renders after a click, so there's no SSR hydration risk.
  useEffect(() => {
    ensurePairingCode();
  }, [ensurePairingCode]);

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
  const sourceLabel = sourceKind === "demo" ? "デモ" : "リアルタイム";

  return (
    <>
      {/* Trigger (bottom of the page) */}
      <button
        onClick={() => setOpen(true)}
        className="w-full min-h-[52px] rounded-2xl bg-surface border border-surface-border neu-raised neu-press transition-transform flex items-center justify-center gap-2 text-base font-medium text-text-secondary"
      >
        <Settings2 size={20} />
        データソース：
        <span className="font-bold text-text-primary">{sourceLabel}</span>
        {sourceKind === "realtime" && (
          <span
            className={`ml-1 inline-block w-2.5 h-2.5 rounded-full ${
              bridgeOnline ? "bg-green-400" : "bg-text-muted"
            }`}
          />
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
            className="w-full max-w-[420px] mx-4 bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-4 neu-raised-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">データソース設定</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="w-10 h-10 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
              >
                <X size={20} />
              </button>
            </div>

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
                      {pairingCode || "————————"}
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
          </div>
        </div>
      )}
    </>
  );
}
