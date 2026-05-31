import type { BrainIndicators, BrainProfile } from "./brain-profile";

/**
 * Dependency-free helpers for the brain-measurement history.
 *
 * Kept import-free (only `import type`, which is erased at runtime) so the
 * cloud-blob migration logic can be unit-tested headlessly without pulling in
 * Supabase / Next.js.
 */

/** Type guard: a value that looks like a stored BrainProfile. */
function isProfile(v: unknown): v is BrainProfile {
  return !!v && typeof v === "object" && "indicators" in v;
}

/**
 * Normalize whatever is stored in the cloud blob / persisted state into a
 * measurements array. Tolerates three historical shapes:
 *  - a `BrainProfile[]` (current)              → filtered to valid entries
 *  - a single `BrainProfile` (legacy blob)     → wrapped into `[profile]`
 *  - null / undefined / garbage                → `[]`
 */
export function normalizeMeasurements(data: unknown): BrainProfile[] {
  if (Array.isArray(data)) return data.filter(isProfile);
  if (isProfile(data)) return [data];
  return [];
}

/** Composite "総合" score = rounded average of all 6 indicator values (0-100). */
export function compositeScore(indicators: BrainIndicators): number {
  const vals = Object.values(indicators);
  if (!vals.length) return 0;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}
