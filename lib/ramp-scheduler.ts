import { FrequencyPhase } from "./programs";

/**
 * Schedule an AudioParam to follow the program's beat frequency along its
 * phases: at every moment the param holds `valueOf(beat)`.
 *
 *   right-ear oscillator: (beat) => carrierFreq + beat   (left ear = carrier, constant)
 *   octave tremolo LFO:   (beat) => beat × ratio
 *
 * `valueOf` must be linear in the beat — a linear ramp of the beat then stays
 * a linear ramp of the param, so every follower moves in lockstep with it.
 *
 * Uses linearRampToValueAtTime for smooth, sample-accurate transitions.
 */
export function scheduleRamps(
  param: AudioParam,
  phases: FrequencyPhase[],
  timeScale: number,
  audioContextCurrentTime: number,
  valueOf: (beat: number) => number
): void {
  const startAt = audioContextCurrentTime;

  // Cancel any previously scheduled ramps
  param.cancelScheduledValues(startAt);

  for (const phase of phases) {
    const phaseStart = startAt + phase.startTime * timeScale;
    const phaseEnd = startAt + phase.endTime * timeScale;

    // Set value at the start of each phase
    param.setValueAtTime(valueOf(phase.startBeatFreq), phaseStart);

    // Ramp to end value
    if (phase.startBeatFreq !== phase.endBeatFreq) {
      param.linearRampToValueAtTime(valueOf(phase.endBeatFreq), phaseEnd);
    }
  }
}
