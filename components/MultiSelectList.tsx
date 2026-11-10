"use client";

import { Check } from "lucide-react";
import ScrollWindow from "@/components/ScrollWindow";
import type { SelectOption } from "@/components/SelectDropdown";
import { useT } from "@/lib/i18n";

interface MultiSelectListProps {
  /** Small caption above the list — what is being chosen. */
  caption: string;
  options: SelectOption[];
  /** The chosen values. */
  values: string[];
  /** A tap on a row: choose it, or take it out again if it is already chosen. */
  onToggle: (value: string) => void;
  /** How many rows can be chosen at once. At the limit the other rows are disabled. */
  max: number;
  /**
   * One line under the list — what to do next. Under the list, not above it:
   * a line that appears or changes above the rows would move them while the
   * finger is still on the list (the third tap would land on the wrong row).
   */
  hint?: string | null;
  /** Size of the scrolling box (ScrollWindow's `scrollClassName`). */
  scrollClassName?: string;
}

/**
 * One list where several rows are chosen at once — tap a row to tick it, tap
 * it again to untick it (Sync Report「測定の比較」: 1〜3 measurements). Used
 * instead of one dropdown per pick: choosing the second and third record from
 * new lists meant opening, picking and closing the same list three times.
 *
 * The rows sit in a ScrollWindow (the sunken box that scrolls on its own, as on
 * Sync Session), so a long history stays one glance tall and the chosen rows
 * stay in view next to the chart. Each row is a checkbox the whole row wide —
 * the tick box is the sign, the 56px row is the target (50-60 age target).
 */
export default function MultiSelectList({
  caption,
  options,
  values,
  onToggle,
  max,
  hint,
  scrollClassName = "",
}: MultiSelectListProps) {
  const t = useT();
  const count = values.length;
  const full = count >= max;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-text-secondary">{caption}</p>
        {/* 何件選んでいるか。上限に来たら色を変える——押せなくなった行が
            なぜ押せないのかを、まずここで分かるように。 */}
        <p
          aria-live="polite"
          className={`shrink-0 text-sm tabular-nums ${full ? "font-bold text-primary" : "text-text-muted"}`}
        >
          {t(`${count}件を選択中`, `${count} selected`)}
        </p>
      </div>

      <div role="group" aria-label={caption}>
        <ScrollWindow scrollClassName={`p-2 ${scrollClassName}`}>
          {options.map((o) => {
            const chosen = values.includes(o.value);
            // 上限に来たら、選んでいない行は押せなくする（黙って別の行を外すと、
            // 窓の外にスクロールしていた選択が知らないうちに消える）。
            const blocked = !chosen && (full || Boolean(o.disabled));
            return (
              <button
                key={o.value}
                type="button"
                role="checkbox"
                aria-checked={chosen}
                disabled={blocked}
                onClick={() => onToggle(o.value)}
                className={`w-full shrink-0 flex items-center gap-3 min-h-[56px] px-3 py-2 rounded-2xl text-left transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${
                  chosen
                    ? "bg-navy-light text-primary neu-inset"
                    : "bg-surface text-text-primary neu-raised-sm"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${
                    chosen ? "bg-primary border-primary text-on-primary" : "border-text-muted"
                  }`}
                >
                  {chosen && <Check size={16} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-base truncate ${chosen ? "font-bold" : "font-medium"}`}
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
              </button>
            );
          })}
        </ScrollWindow>
      </div>

      {hint && <p className="text-sm text-text-secondary">{hint}</p>}
    </div>
  );
}
