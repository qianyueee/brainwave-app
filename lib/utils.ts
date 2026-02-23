import { FrequencyPhase } from "./programs";

/** Format seconds as mm:ss */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Get the current phase for a given elapsed time (already scaled).
 * Returns the phase and interpolated beat frequency.
 */
export function getCurrentPhaseInfo(
  phases: FrequencyPhase[],
  elapsedScaled: number
): { phase: FrequencyPhase | null; beatFreq: number } {
  for (const phase of phases) {
    if (elapsedScaled >= phase.startTime && elapsedScaled < phase.endTime) {
      const progress =
        phase.endTime === phase.startTime
          ? 1
          : (elapsedScaled - phase.startTime) / (phase.endTime - phase.startTime);
      const beatFreq =
        phase.startBeatFreq + (phase.endBeatFreq - phase.startBeatFreq) * progress;
      return { phase, beatFreq };
    }
  }
  // Past the last phase
  const last = phases[phases.length - 1];
  if (last) {
    return { phase: last, beatFreq: last.endBeatFreq };
  }
  return { phase: null, beatFreq: 0 };
}
