"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { getProgramById, isCustomProgramId, type CustomProgram } from "@/lib/programs";
import { getCurrentPhaseInfo } from "@/lib/utils";
import CymaticsCanvas from "@/components/CymaticsCanvas";

// ── Frequency → cymatics parameter mappings ──

/** Beat frequency (Hz, 1.5–40) → N-fold radial symmetry. Calmer = fewer petals. */
function symmetryForBeat(beatFreq: number): number {
  if (beatFreq <= 1.5) return 3;
  if (beatFreq <= 4) return 3 + ((beatFreq - 1.5) / (4 - 1.5)) * (4 - 3);
  if (beatFreq <= 7.83) return 4 + ((beatFreq - 4) / (7.83 - 4)) * (6 - 4);
  if (beatFreq <= 13) return 6 + ((beatFreq - 7.83) / (13 - 7.83)) * (8 - 6);
  if (beatFreq <= 40) return 8 + ((beatFreq - 13) / (40 - 13)) * (12 - 8);
  return 12;
}

/** Synth dominant frequency (Hz, 20–10k) → N-fold symmetry, log-mapped to [4..16]. */
function symmetryForFreq(freq: number): number {
  const lo = Math.log2(20);
  const hi = Math.log2(10000);
  const t = Math.min(1, Math.max(0, (Math.log2(Math.max(freq, 20)) - lo) / (hi - lo)));
  return 4 + t * (16 - 4);
}

/** driveFreq → concentric ring density, log-mapped 1.5Hz–10kHz → [3..10]. */
function radialModeForFreq(freq: number): number {
  const lo = Math.log2(1.5);
  const hi = Math.log2(10000);
  const t = Math.min(1, Math.max(0, (Math.log2(Math.max(freq, 1.5)) - lo) / (hi - lo)));
  return 3 + t * (10 - 3);
}

/** Loudest layer frequency of a custom program; ties favour the lower pitch. */
function dominantFrequency(prog: CustomProgram): number {
  const p = prog.preset;
  const layers = [...(p.layers ?? []), ...(p.leftLayers ?? []), ...(p.rightLayers ?? [])];
  if (!layers.length) return 220;
  let best = layers[0];
  for (const l of layers) {
    if (l.volume > best.volume || (l.volume === best.volume && l.frequency < best.frequency)) {
      best = l;
    }
  }
  return best.frequency;
}

/** Stable 0..1 fingerprint from a program id, for per-program pattern variation. */
function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export default function Visualizer() {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const elapsed = useAppStore((s) => s.elapsed);
  const programId = useAppStore((s) => s.selectedProgramId);
  const timerDuration = useAppStore((s) => s.timerDuration);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);
  const publishedPrograms = usePublishedProgramsStore((s) => s.programs);

  const [fullscreen, setFullscreen] = useState(false);

  // ── Resolve what's playing: binaural program vs custom (synth) program ──
  const isCustom = isCustomProgramId(programId);
  const program = isCustom ? undefined : getProgramById(programId);
  const customProgram = isCustom
    ? savedPrograms.find((p) => p.id === programId) ??
      publishedPrograms.find((p) => p.id === programId)
    : undefined;

  // Per-program fingerprint + gentle spin.
  const seed = hashSeed(programId);
  const targetSpin = 0.05 + seed * 0.06;

  let targetSym: number;
  let targetRing: number;
  let displayFreq: number;
  let label: string;

  if (isCustom) {
    const sig = customProgram ? dominantFrequency(customProgram) : 220;
    targetSym = symmetryForFreq(sig);
    targetRing = radialModeForFreq(sig);
    displayFreq = sig;
    label = customProgram?.name ?? "カスタム";
  } else {
    const timeScale = program ? timerDuration / program.defaultDuration : 1;
    const scaledElapsed = elapsed / timeScale;
    const info = program
      ? getCurrentPhaseInfo(program.phases, scaledElapsed)
      : { phase: null, beatFreq: 0 };
    const sig = program?.targetBeatFreq ?? info.beatFreq;
    targetSym = symmetryForBeat(sig);
    targetRing = radialModeForFreq(sig);
    displayFreq =
      info.phase?.name === "導入" && program ? program.targetBeatFreq : info.beatFreq;
    label = info.phase ? info.phase.name : "待機中";
  }

  const params = { isPlaying, sym: targetSym, ring: targetRing, spin: targetSpin, seed };

  // Fullscreen: lock body scroll + Escape to close.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      {/* Tap the mandala to view it fullscreen */}
      <button
        type="button"
        onClick={() => setFullscreen(true)}
        aria-label="全画面で表示"
        className="relative w-56 h-56 rounded-full active:scale-[0.98] transition-transform"
      >
        <CymaticsCanvas {...params} className="w-full h-full rounded-full neu-raised" />
        <span className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white/70 pointer-events-none">
          <Maximize2 size={16} />
        </span>
      </button>

      {/* Info */}
      <div className="text-center">
        <p className="text-lg font-medium text-text-primary">{displayFreq.toFixed(1)} Hz</p>
        <p className="text-sm text-text-secondary">{label}</p>
      </div>

      {/* Fullscreen overlay */}
      {fullscreen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            onClick={() => setFullscreen(false)}
            role="button"
            aria-label="閉じる"
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8"
            style={{ backgroundColor: "#04060d", animation: "fade-in 0.25s ease-out" }}
          >
            <CymaticsCanvas
              {...params}
              className="rounded-full"
              style={{
                width: "min(92vw, 92vh)",
                height: "min(92vw, 92vh)",
                backgroundColor: "#04060d",
              }}
            />
            <div className="text-center">
              <p className="text-xl font-medium text-white">{displayFreq.toFixed(1)} Hz</p>
              <p className="text-base text-white/60 mt-1">{label}</p>
            </div>
            <p className="absolute bottom-10 text-sm text-white/40">タップで戻る</p>
          </div>,
          document.body
        )}
    </div>
  );
}
