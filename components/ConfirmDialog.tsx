"use client";

import { useEffect, useId } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** primary = additive action, accent = replaces existing data */
  tone?: "primary" | "accent";
  /** Confirm action is running (cloud sync): lock the dialog and show a spinner */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "キャンセル",
  tone = "primary",
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();

  // Escape closes, unless the confirmed action is still running.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={() => { if (!busy) onClose(); }}
      style={{ animation: "fade-in 0.15s ease-out" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[420px] mx-4 bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-4 neu-raised-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-bold text-text-primary text-center">
          {title}
        </h2>

        {message && (
          <p className="text-base text-text-secondary text-center leading-relaxed whitespace-pre-line">
            {message}
          </p>
        )}

        <button
          onClick={onConfirm}
          disabled={busy}
          className={`w-full min-h-[56px] rounded-2xl text-base font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-all neu-raised neu-press ${
            tone === "accent" ? "bg-accent text-on-accent" : "bg-primary text-on-primary"
          }`}
        >
          {busy && (
            <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          )}
          {busy ? "保存中..." : confirmLabel}
        </button>

        <button
          onClick={onClose}
          disabled={busy}
          className="w-full min-h-[56px] rounded-2xl bg-navy text-text-secondary text-base font-bold disabled:opacity-40 active:scale-95 neu-raised-sm neu-press"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
