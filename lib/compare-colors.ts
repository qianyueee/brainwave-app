/**
 * Per-series colors for the log comparison charts (spectrum line chart +
 * 6-indicator radar), oldest→newest. Shared so the two charts use the SAME
 * color for the same measurement. Both the 2- and 3-series cases use highly
 * distinct hues so overlapping lines/shapes stay easy to tell apart:
 * 2 series → cyan · rose; 3 series → cyan · amber · rose.
 */
export function compareSeriesColors(count: number): string[] {
  return count >= 3
    ? ["#06b6d4", "#f59e0b", "#f43f5e"]
    : ["#06b6d4", "#f43f5e"];
}
