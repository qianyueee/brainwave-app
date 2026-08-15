"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Link2, Settings2, X } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { supabase } from "@/lib/supabase";

/**
 * 接続設定（PCブリッジとのペアリング）。マインドマップの画面が設定パネルでは
 * なく四象限マップから始まるよう、中身はダイアログに畳んである。
 *
 * デモ／リアルタイムの二択トグルは置かない——ふだんはデモが流れていて、
 * 「接続する」を押した時にだけリアルタイムへ切り替わる。押す行為そのものが
 * 選択なので、同じ選択肢をボタンとして二重に並べる必要がない。いま何が
 * 流れているかはボタンではなく <SourceStatusLine /> の一行が受け持つ。
 */
export default function SourceDialog() {
  const sourceKind = useMindStore((s) => s.sourceKind);
  const setSourceKind = useMindStore((s) => s.setSourceKind);
  const statusDetail = useMindStore((s) => s.statusDetail);
  const bridgeOnline = useMindStore((s) => s.bridgeOnline);
  const pairingCode = useMindStore((s) => s.pairingCode);
  const ensurePairingCode = useMindStore((s) => s.ensurePairingCode);
  const isRecording = useMindStore((s) => s.isRecording);

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
  const realtime = sourceKind === "realtime";

  // 「接続する」＝接続の意思表示なので、押した時点でリアルタイムに切り替えて
  // ダイアログ（コードとブリッジ状態）を開く。クラウド未設定のときだけは
  // 切り替えても受け口が無いので、ダイアログでその旨だけ伝える。
  const handleTrigger = () => {
    if (!realtime && cloudConfigured) setSourceKind("realtime");
    setOpen(true);
  };

  return (
    <>
      {/* Trigger — 測定ボタンの上、測定者チップの左に並ぶ */}
      <button
        onClick={handleTrigger}
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
                bridgeOnline ? "bg-success" : "bg-text-muted"
              }`}
            />
          </>
        ) : (
          <>
            接続する
            <Link2 size={18} strokeWidth={2} />
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
            className="w-full max-w-[420px] mx-4 bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-4 neu-raised-lg"
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

            {!cloudConfigured ? (
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
                      {copied ? <Check size={20} className="text-success" /> : <Copy size={20} />}
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
                      bridgeOnline ? "bg-success" : "bg-text-muted"
                    }`}
                  />
                  <p className="text-base text-text-primary">
                    ブリッジ：{bridgeOnline ? "オンライン" : "オフライン"}
                  </p>
                </div>
                {statusDetail && <p className="text-sm text-text-secondary">{statusDetail}</p>}
              </div>
            )}

            {/* 二択トグルを畳んだぶん、デモへ戻る道だけは残す（接続をやめたら
                画面が空になる袋小路を作らないため）。測定中に出どころが
                変わらないことはトリガー側の disabled が担保しているので、
                ここは realtime かどうかだけを見る。 */}
            {realtime && !isRecording && (
              <button
                onClick={() => setSourceKind("demo")}
                className="min-h-12 rounded-2xl bg-navy text-text-secondary text-base font-bold neu-raised-sm neu-press transition-transform"
              >
                デモデータに戻す
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * いま画面に出ている数字の出どころを言い切る一行。測定ボタンの真下に置く。
 *
 * 以前はデータソースがボタンのラベル（「データソース：デモ」）を兼ねていたが、
 * ボタンは「これから何をするか」、この行は「いま何が起きているか」——役割が
 * 違うので分けた。デモは控えめな灰、リアルタイムは主色で、脳波が本物かどうかが
 * 色でも分かるようにしている。
 */
export function SourceStatusLine() {
  const sourceKind = useMindStore((s) => s.sourceKind);
  const realtime = sourceKind === "realtime";

  return (
    <p
      className={`flex items-center gap-1.5 text-xs ${
        realtime ? "text-primary font-medium" : "text-text-muted"
      }`}
    >
      <Settings2 size={16} strokeWidth={1.5} className="shrink-0" />
      {realtime ? "リアルタイムデータを表示しています" : "デモデータを表示しています"}
    </p>
  );
}
