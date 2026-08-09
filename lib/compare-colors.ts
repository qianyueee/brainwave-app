/**
 * Per-series colors for the log comparison charts (spectrum line chart +
 * 6-indicator radar), oldest→newest. Shared so the two charts use the SAME
 * color for the same measurement. Both the 2- and 3-series cases use highly
 * distinct hues so overlapping lines/shapes stay easy to tell apart:
 * 2 series → cyan · rose; 3 series → cyan · amber · rose.
 *
 * Two sets: the default was tuned for the dark midnight palette; the light
 * set deepens each hue for the cream/mint/violet daytime palettes (these land
 * in SVG stroke/fill attributes, which cannot evaluate CSS var()).
 */
export function compareSeriesColors(
  count: number,
  scheme: "light" | "dark" = "dark"
): string[] {
  const [c1, c2, c3] =
    scheme === "light"
      ? ["#0e7490", "#b45309", "#be123c"]
      : ["#06b6d4", "#f59e0b", "#f43f5e"];
  return count >= 3 ? [c1, c2, c3] : [c1, c3];
}
