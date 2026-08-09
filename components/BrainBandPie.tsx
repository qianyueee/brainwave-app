"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { BandKey, BandPowers } from "@/lib/mind/types";
import { BAND_META, getBandColors } from "@/lib/mind/types";
import { useDocumentScheme } from "@/components/useDocumentScheme";

/**
 * 8-band brainwave balance: a colored pie (Delta at 12 o'clock, clockwise) with
 * a two-column legend below (swatch · name · %). The legend replaces on-slice
 * labels so the values stay large and never overlap on the tiny γ slices.
 *
 * Tapping a legend row hides that band and dims the row. δ normally dominates
 * the total, which squeezes every other band into a sliver — hiding it lets the
 * pie renormalize over what is left, so the small bands become readable. The
 * printed percentages renormalize with it (each band's share of the *shown*
 * bands) so a number always matches its slice; hidden rows show — since they
 * are out of that calculation. With nothing hidden the shares are the measured
 * share of all 8 bands, exactly as computeBandPowers produced them.
 *
 * Controlled (the selection lives in the page) because Fullscreenable renders
 * its children twice — inline and inside the overlay — and both copies must
 * show the same selection.
 */
export default function BrainBandPie({
  powers,
  hiddenKeys = [],
  onChangeHidden,
}: {
  powers: BandPowers;
  hiddenKeys?: BandKey[];
  /** Omit to render a plain, non-interactive legend. */
  onChangeHidden?: (next: BandKey[]) => void;
}) {
  const bandColors = getBandColors(useDocumentScheme());
  const data = BAND_META.map((b) => ({ key: b.key, name: b.ja, value: powers[b.key] }));
  const shown = data.filter((d) => !hiddenKeys.includes(d.key));
  // Share of the shown bands, so every printed number matches its slice. With
  // nothing hidden this total is 100, leaving the measured values untouched.
  const shownTotal = shown.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      {shown.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="82%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              {shown.map((d) => (
                <Cell key={d.key} fill={bandColors[d.key]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[220px] flex items-center justify-center px-4">
          <p className="text-base text-text-secondary text-center">
            表示する波を選んでください
          </p>
        </div>
      )}

      {/* Only meaningful once something is hidden: the pie no longer covers the
          whole measurement, and tapping rows back on one by one is tedious. */}
      {onChangeHidden && hiddenKeys.length > 0 && (
        <div className="flex items-center justify-between gap-3 mt-2 px-1">
          <p className="text-xs text-text-muted">割合は表示中の波で再計算</p>
          <button
            type="button"
            onClick={() => onChangeHidden([])}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-navy text-text-secondary text-sm font-bold neu-raised-sm neu-press transition-transform"
          >
            すべて表示
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 mt-1 px-1">
        {data.map((d) => {
          const hidden = hiddenKeys.includes(d.key);
          const row = (
            <>
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: bandColors[d.key] }}
              />
              <span className="flex-1 min-w-0 truncate text-text-secondary">{d.name}</span>
              <span className="font-mono tabular-nums font-bold text-text-primary">
                {hidden || shownTotal <= 0
                  ? "—"
                  : `${((d.value / shownTotal) * 100).toFixed(1)}%`}
              </span>
            </>
          );

          if (!onChangeHidden) {
            return (
              <div key={d.key} className="flex items-center gap-1.5 text-xs py-0.5">
                {row}
              </div>
            );
          }

          return (
            <button
              key={d.key}
              type="button"
              onClick={() =>
                onChangeHidden(
                  hidden
                    ? hiddenKeys.filter((k) => k !== d.key)
                    : [...hiddenKeys, d.key]
                )
              }
              aria-pressed={!hidden}
              aria-label={`${d.name}を${hidden ? "表示する" : "非表示にする"}`}
              // Rows stay tappable (they toggle a band), so the height only comes
              // down to 44px — the practical floor — rather than shrinking with
              // the type.
              className={`flex items-center gap-1.5 text-xs min-h-[44px] px-2 -mx-1 rounded-xl text-left transition-opacity active:opacity-60 ${
                hidden ? "opacity-40" : ""
              }`}
            >
              {row}
            </button>
          );
        })}
      </div>
    </div>
  );
}
