import { FrequencyPhase } from "./programs";
import type { TimelineSegment } from "./synth-engine";

/** Format seconds as mm:ss */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Find the timeline segment active at a given elapsed time (seconds). */
export function getCurrentSegmentInfo(
  segments: TimelineSegment[],
  elapsed: number
): { index: number; segment: TimelineSegment | null } {
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const dur = Math.max(1, segments[i].durationSec);
    if (elapsed < acc + dur) {
      return { index: i, segment: segments[i] };
    }
    acc += dur;
  }
  const last = segments.length - 1;
  return last >= 0 ? { index: last, segment: segments[last] } : { index: 0, segment: null };
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
