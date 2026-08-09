let audioContext: AudioContext | null = null;

// User-initiated pause intent. While true, nothing may auto-resume the
// suspended context — not this getter, not keep-alive's visibilitychange.
// Owned here because every audio path funnels through getAudioContext().
let userPaused = false;

export function setUserPaused(v: boolean): void {
  userPaused = v;
}

export function isUserPaused(): boolean {
  return userPaused;
}

/** Get or create global AudioContext singleton. Must call from user gesture on iOS. */
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended" && !userPaused) {
    audioContext.resume();
  }
  return audioContext;
}
