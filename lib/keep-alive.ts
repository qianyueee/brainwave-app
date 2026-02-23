/**
 * Background audio keep-alive for mobile browsers.
 *
 * Routes all AudioContext output through an <audio> element via
 * MediaStreamDestinationNode. Browsers treat <audio> playback far more
 * leniently than raw Web Audio API — they won't suspend it in the background
 * the way they suspend AudioContext.destination.
 *
 * All audio engine nodes should connect to getAudioDestination() instead of
 * ctx.destination. The <audio> element becomes the real speaker output.
 *
 * Additionally:
 * - Media Session API provides lock-screen metadata and play/pause controls.
 * - visibilitychange listener resumes AudioContext when returning to foreground.
 */

import { getAudioContext } from "./audio-context";

let audioEl: HTMLAudioElement | null = null;
let streamDest: MediaStreamAudioDestinationNode | null = null;
let listening = false;

/**
 * Get the audio destination node that all engines should connect to.
 * On first call, creates the MediaStreamDestination + <audio> bridge.
 * Falls back to ctx.destination if MediaStream API is unavailable.
 */
export function getAudioDestination(): AudioNode {
  const ctx = getAudioContext();

  if (typeof window === "undefined" || !ctx.createMediaStreamDestination) {
    return ctx.destination;
  }

  if (!streamDest) {
    streamDest = ctx.createMediaStreamDestination();
  }

  if (!audioEl) {
    audioEl = new Audio();
    audioEl.srcObject = streamDest.stream;
    // Must not be muted — browsers won't keep a muted <audio> alive
    audioEl.volume = 1.0;
  }

  return streamDest;
}

/**
 * Start the <audio> playback and register Media Session.
 * Must be called from a user gesture context (click/touch).
 */
export function startKeepAlive(title?: string): void {
  if (typeof window === "undefined") return;

  // Ensure destination is set up
  getAudioDestination();

  // Start the <audio> element (needs user gesture)
  if (audioEl) {
    audioEl.play().catch(() => {
      // Autoplay blocked — acceptable, we tried from user gesture context
    });
  }

  // Media Session API (lock-screen metadata)
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title ?? "脳波チューニング",
      artist: "Brainwave App",
      album: "Binaural Beats",
    });
  }

  // visibilitychange listener (resume AudioContext when returning)
  if (!listening) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    listening = true;
  }
}

/** Stop the keep-alive and clean up. */
export function stopKeepAlive(): void {
  if (audioEl) {
    audioEl.pause();
    // Don't null srcObject here — we reuse the same streamDest
  }

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.setActionHandler("play", null);
    navigator.mediaSession.setActionHandler("pause", null);
  }

  if (listening) {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    listening = false;
  }
}

/**
 * Register Media Session action handlers for lock-screen play/pause.
 */
export function setMediaSessionHandlers(
  onPlay: () => void,
  onPause: () => void,
): void {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.setActionHandler("play", onPlay);
  navigator.mediaSession.setActionHandler("pause", onPause);
}

// ---- internal ----

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        ctx.resume();
      }
    } catch {
      // getAudioContext may throw if never initialised; ignore
    }
    // Ensure <audio> is still playing
    if (audioEl && audioEl.paused) {
      audioEl.play().catch(() => {});
    }
  }
}
