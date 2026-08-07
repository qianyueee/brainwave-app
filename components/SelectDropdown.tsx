"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  /** First line — the option's name (a person, a measurement's date-time). */
  label: string;
  /** Second line — supporting detail (session tag, duration, whose record). */
  detail?: string;
  /** Short right-aligned value, e.g. a composite score or a record count. */
  trailing?: string;
  trailingColor?: string;
  disabled?: boolean;
}

interface SelectDropdownProps {
  /** Small caption above the button — what is being chosen. */
  caption: string;
  icon?: ReactNode;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Shown when nothing is selected (or there is nothing to select). */
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Neu-styled dropdown used for the 測定者 → 記録 two-step pickers on Sync Brain
 * (過去の測定) and Sync History (脳波の記録). Collapsed by default so a long
 * history stays one glance tall, and the option list opens inline below the
 * button — the same pattern as the my-sign picker on the home card.
 *
 * Sized for the 50-60 age target: 56px button, 52px options, 16px+ text.
 */
export default function SelectDropdown({
  caption,
  icon,
  value,
  options,
  onChange,
  placeholder = "選択してください",
  disabled,
}: SelectDropdownProps) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;
  const empty = options.length === 0;
  // Nothing to choose from is nothing to open — derived rather than stored, so a
  // list that shrinks to one option while open (after a delete) simply closes.
  const open = expanded && options.length > 1;

  // Close on Escape or a tap outside, so an open list never traps the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      <p className="text-sm text-text-secondary">{caption}</p>

      <button
        onClick={() => setExpanded((v) => !v)}
        disabled={disabled || empty || options.length === 1}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={caption}
        className="w-full flex items-center gap-3 min-h-[56px] px-4 py-2 rounded-2xl bg-surface border border-surface-border neu-raised neu-press transition-transform text-left disabled:opacity-70 disabled:active:scale-100"
      >
        {icon && (
          <span className="w-9 h-9 shrink-0 rounded-xl bg-navy neu-inset flex items-center justify-center text-primary">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-text-primary truncate">
            {selected?.label ?? placeholder}
          </span>
          {selected?.detail && (
            <span className="block text-sm text-text-secondary truncate">
              {selected.detail}
            </span>
          )}
        </span>
        {selected?.trailing && (
          <span
            className="shrink-0 text-base font-mono font-bold tabular-nums"
            style={selected.trailingColor ? { color: selected.trailingColor } : undefined}
          >
            {selected.trailing}
          </span>
        )}
        {options.length > 1 && (
          <ChevronDown
            size={20}
            className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={caption}
          className="max-h-[320px] overflow-y-auto rounded-2xl bg-navy neu-inset p-2 flex flex-col gap-2"
        >
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                role="option"
                aria-selected={isSelected}
                disabled={o.disabled}
                onClick={() => {
                  onChange(o.value);
                  setExpanded(false);
                }}
                className={`w-full flex items-center gap-3 min-h-[52px] px-4 py-2 rounded-2xl text-left transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${
                  isSelected
                    ? "bg-navy-light text-primary neu-inset"
                    : "bg-surface text-text-primary neu-raised-sm"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-base truncate ${isSelected ? "font-bold" : "font-medium"}`}
                  >
                    {o.label}
                  </span>
                  {o.detail && (
                    <span className="block text-sm text-text-secondary truncate">{o.detail}</span>
                  )}
                </span>
                {o.trailing && (
                  <span
                    className="shrink-0 text-base font-mono font-bold tabular-nums"
                    style={o.trailingColor ? { color: o.trailingColor } : undefined}
                  >
                    {o.trailing}
                  </span>
                )}
                {isSelected && <Check size={18} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
