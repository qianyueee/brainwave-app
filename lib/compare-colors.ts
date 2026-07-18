/**
 * Per-series colors for the log comparison charts (spectrum line chart +
 * 6-indicator radar), oldest→newest. Shared so the two charts use the SAME
 * color for the same measurement. For 3 series: three highly distinct hues
 * (cyan · amber · rose); for 2: the theme's muted→primary before/after pair.
 */
export function compareSeriesColors(count: number, muted: string, primary: string): string[] {
  return count >= 3 ? ["#06b6d4", "#f59e0b", "#f43f5e"] : [muted, primary];
}
