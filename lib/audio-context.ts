let audioContext: AudioContext | null = null;

/** Get or create global AudioContext singleton. Must call from user gesture on iOS. */
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}
