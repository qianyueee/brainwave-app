"use client";

import { useSyncExternalStore } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
  type XAxisTickContentProps,
} from "recharts";
import { BAND_META, BAND_SHORT_EN, type BandKey, type BandPowers } from "@/lib/mind/types";
import { compareSeriesColors } from "@/lib/compare-colors";
import { useDocumentScheme } from "@/components/useDocumentScheme";
import { THEME_CHANGE_EVENT } from "@/lib/theme";
import { useLocale, type Locale } from "@/lib/i18n";

const SERVER_COLORS = "#4a7fd4|#1e3a5f|#8890a8"; // primary|grid|text

function readThemeColors(): string {
  if (typeof window === "undefined") return SERVER_COLORS;
  const get = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  return [
    get("--color-primary", "#4a7fd4"),
    get("--color-navy-lighter", "#1e3a5f"),
    get("--color-text-secondary", "#8890a8"),
  ].join("|");
}

function subscribeTheme(cb: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, cb);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, cb);
}

export interface BandSeries {
  bands: BandPowers;
  label: string;
}

function bandName(key: BandKey, locale: Locale): string {
  const meta = BAND_META.find((b) => b.key === key)!;
  return locale === "en" ? meta.en : meta.ja;
}

/**
 * The label under each group. Japanese fits one line (低α波, as on the live
 * equalizer); English "High α" is wider than a phone's ~34px column, so it goes
 * on two lines — qualifier over the Greek letter.
 */
function tickLines(key: BandKey, locale: Locale): string[] {
  if (locale !== "en") return [BAND_META.find((b) => b.key === key)!.ja];
  return BAND_SHORT_EN[key].split(" ");
}

function BandTick({
  x,
  y,
  payload,
  fill,
  locale,
}: Pick<XAxisTickContentProps, "x" | "y" | "payload" | "fill"> & { locale: Locale }) {
  const lines = tickLines(payload.value as BandKey, locale);
  return (
    <text x={x} y={y} textAnchor="middle" fill={fill} fontSize={12}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? "0.9em" : "1.15em"}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/**
 * The 8-band balance of 1–3 measurements as grouped bars: x = wave type, y = its
 * share (%) of the measurement's 8 bands — the same numbers as the report's pie.
 * Each group holds one bar per measurement, oldest→newest, in the colors the
 * 6-indicator radar uses for the same measurements.
 *
 * With one measurement each bar carries its value; with two or three the bars
 * are too narrow for numbers, so exact values live in the tooltip (tap a group).
 */
export default function BrainBandCompare({ series }: { series: BandSeries[] }) {
  const locale = useLocale();
  const colorStr = useSyncExternalStore(subscribeTheme, readThemeColors, () => SERVER_COLORS);
  const [primary, grid, text] = colorStr.split("|");
  // Oldest → newest, shared with the 6-indicator radar so colors correspond.
  const barColors = compareSeriesColors(series.length, useDocumentScheme());
  const single = series.length === 1;

  const data = BAND_META.map((b) => {
    const row: Record<string, string | number> = { key: b.key };
    series.forEach((s, i) => {
      row[`s${i}`] = s.bands[b.key];
    });
    return row;
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={data}
          margin={{ top: single ? 18 : 10, right: 4, left: -4, bottom: 0 }}
          barCategoryGap="18%"
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis
            dataKey="key"
            interval={0}
            height={locale === "en" ? 36 : 24}
            tickLine={false}
            axisLine={{ stroke: grid }}
            tick={(props: XAxisTickContentProps) => (
              <BandTick x={props.x} y={props.y} payload={props.payload} fill={text} locale={locale} />
            )}
          />
          <YAxis
            domain={[0, "auto"]}
            allowDecimals={false}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: text, fontSize: 12 }}
            width={40}
            tickLine={false}
            axisLine={{ stroke: grid }}
          />
          <Tooltip
            cursor={{ fill: grid, fillOpacity: 0.35 }}
            isAnimationActive={false}
            content={({ active, label }) => {
              if (!active || label == null) return null;
              const key = label as BandKey;
              return (
                <div className="rounded-xl bg-navy-light border border-surface-border px-3 py-2 text-sm shadow-lg">
                  <p className="font-bold text-text-primary mb-1">{bandName(key, locale)}</p>
                  {series.map((s, i) => (
                    <p key={i} className="flex items-center gap-2 text-text-secondary">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: barColors[i] ?? primary }}
                      />
                      {!single && <span className="max-w-40 truncate">{s.label}</span>}
                      <span className="ml-auto pl-2 font-mono tabular-nums font-bold text-text-primary">
                        {s.bands[key].toFixed(1)}%
                      </span>
                    </p>
                  ))}
                </div>
              );
            }}
          />
          {series.map((s, i) => (
            <Bar
              key={i}
              dataKey={`s${i}`}
              name={s.label}
              fill={barColors[i] ?? primary}
              radius={[4, 4, 0, 0]}
              maxBarSize={single ? 28 : 18}
              isAnimationActive={false}
            >
              {single && (
                <LabelList
                  dataKey="s0"
                  position="top"
                  offset={4}
                  fill={text}
                  fontSize={12}
                  formatter={(v) => (typeof v === "number" ? v.toFixed(1) : "")}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Which bar is which measurement (oldest → newest). One measurement needs
          no key — the card's heading already names it. */}
      {!single && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 text-xs text-text-secondary">
          {series.map((s, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: barColors[i] ?? primary }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
