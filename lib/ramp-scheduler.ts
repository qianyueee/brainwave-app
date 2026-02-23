import { FrequencyPhase } from "./programs";

/**
 * Schedule frequency ramps on the right-channel oscillator.
 *
 * Right ear frequency = carrierFreq + beatFreq
 * Left ear frequency  = carrierFreq (constant)
 *
 * Uses linearRampToValueAtTime for smooth, sample-accurate transitions.
 */
export function scheduleRamps(
  rightOscillator: OscillatorNode,
  carrierFreq: number,
  phases: FrequencyPhase[],
  timeScale: number,
  audioContextCurrentTime: number
): void {
  const freq = rightOscillator.frequency;
  const startAt = audioContextCurrentTime;

  // Cancel any previously scheduled ramps
  freq.cancelScheduledValues(startAt);

  for (const phase of phases) {
    const phaseStart = startAt + phase.startTime * timeScale;
    const phaseEnd = startAt + phase.endTime * timeScale;

    // Set value at the start of each phase
    freq.setValueAtTime(carrierFreq + phase.startBeatFreq, phaseStart);

    // Ramp to end value
    if (phase.startBeatFreq !== phase.endBeatFreq) {
      freq.linearRampToValueAtTime(carrierFreq + phase.endBeatFreq, phaseEnd);
    }
  }
}
