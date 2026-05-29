"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { getProgramById, isCustomProgramId, type CustomProgram } from "@/lib/programs";
import { getCurrentPhaseInfo } from "@/lib/utils";

/** Beat frequency (Hz) → Lissajous ratio a:b. Fewer lobes when calmer. */
function ratioForBeat(beatFreq: number): [number, number] {
  if (beatFreq < 4) return [2, 1]; // delta
  if (beatFreq < 13) return [3, 2]; // theta / alpha
  if (beatFreq < 30) return [4, 3]; // beta
  return [5, 4]; // gamma
}

/** Audible main frequency (Hz) → Lissajous ratio, so custom programs differ by pitch. */
function ratioForFreq(freq: number): [number, number] {
  if (freq < 120) return [2, 1];
  if (freq < 350) return [3, 2];
  if (freq < 900) return [4, 3];
  if (freq < 2500) return [5, 4];
  return [5, 3];
}

/** Log-frequency → hue 0°(red)…300°(violet), covering 1.5Hz beats up to 10kHz synth. */
function freqToHue(freq: number): number {
  const lo = Math.log2(1.5);
  const hi = Math.log2(10000);
  const t = Math.min(1, Math.max(0, (Math.log2(Math.max(freq, 1.5)) - lo) / (hi - lo)));
  return t * 300;
}

/** Dominant (loudest) layer frequency of a custom program; ties broken toward the lower pitch. */
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

interface LissajousParams {
  isPlaying: boolean;
  hue: number;
  targetA: number;
  targetB: number;
  spin: number;
}

export default function Visualizer() {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const elapsed = useAppStore((s) => s.elapsed);
  const programId = useAppStore((s) => s.selectedProgramId);
  const timerDuration = useAppStore((s) => s.timerDuration);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);
  const publishedPrograms = usePublishedProgramsStore((s) => s.programs);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const paramsRef = useRef<LissajousParams>({
    isPlaying: false,
    hue: 200,
    targetA: 3,
    targetB: 2,
    spin: 0.4,
  });

  // ── Resolve what's playing: binaural program vs custom (synth) program ──
  const isCustom = isCustomProgramId(programId);
  const program = isCustom ? undefined : getProgramById(programId);
  const customProgram = isCustom
    ? savedPrograms.find((p) => p.id === programId) ??
      publishedPrograms.find((p) => p.id === programId)
    : undefined;

  let driveFreq: number; // frequency that drives colour + shape
  let targetA: number;
  let targetB: number;
  let spin: number;
  let displayFreq: number;
  let label: string;

  if (isCustom) {
    // Custom programs have static layers (no timeline) → main frequency = loudest layer.
    driveFreq = customProgram ? dominantFrequency(customProgram) : 0;
    [targetA, targetB] = ratioForFreq(driveFreq);
    spin = 0.4; // gentle, since the frequency doesn't move over time
    displayFreq = driveFreq;
    label = customProgram?.name ?? "カスタム";
  } else {
    const timeScale = program ? timerDuration / program.defaultDuration : 1;
    const scaledElapsed = elapsed / timeScale;
    const info = program
      ? getCurrentPhaseInfo(program.phases, scaledElapsed)
      : { phase: null, beatFreq: 0 };
    driveFreq = info.beatFreq;
    [targetA, targetB] = ratioForBeat(info.beatFreq);
    spin = 0.15 + info.beatFreq * 0.06;
    displayFreq =
      info.phase?.name === "導入" && program ? program.targetBeatFreq : info.beatFreq;
    label = info.phase ? info.phase.name : "待機中";
  }

  const hue = freqToHue(driveFreq);

  // Feed the latest values into the animation loop without restarting it.
  useEffect(() => {
    paramsRef.current = { isPlaying, hue, targetA, targetB, spin };
  }, [isPlaying, hue, targetA, targetB, spin]);

  // Start the requestAnimationFrame loop once; it reads paramsRef each frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let a = paramsRef.current.targetA;
    let b = paramsRef.current.targetB;
    let hueNow = paramsRef.current.hue;
    let delta = 0;
    let last = performance.now();
    let cssW = 0;
    let cssH = 0;

    // Background colour from the dynamic circadian palette (refreshed ~1s).
    let bg = "#020617";
    let lastStyle = 0;
    const readBg = () => {
      const n = getComputedStyle(document.documentElement).getPropertyValue("--dyn-navy").trim();
      if (n) bg = n;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const rect = canvas.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cssW, cssH);
    };

    readBg();
    resize();
    window.addEventListener("resize", resize);

    const POINTS = 360;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // clamp (tab switches)
      last = now;
      if (now - lastStyle > 800) {
        readBg();
        lastStyle = now;
      }
      const p = paramsRef.current;
      const k = Math.min(1, dt * 1.5);

      // Ease ratio + hue toward targets for smooth morphing / colour transitions.
      a += (p.targetA - a) * k;
      b += (p.targetB - b) * k;
      hueNow += (p.hue - hueNow) * k;

      // Phase precession; gentle idle spin when paused.
      const speed = p.isPlaying ? p.spin : 0.05;
      delta += speed * dt;

      const color = `hsl(${hueNow.toFixed(1)}, 88%, 60%)`;

      // Phosphor fade: cover with a translucent base instead of clearing.
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.globalAlpha = 1;

      const cx = cssW / 2;
      const cy = cssH / 2;
      const r = Math.min(cssW, cssH) * 0.4;

      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      for (let i = 0; i <= POINTS; i++) {
        const t = (i / POINTS) * Math.PI * 2;
        const x = cx + r * Math.sin(a * t + delta);
        const y = cy + r * Math.sin(b * t);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.globalAlpha = p.isPlaying ? 0.9 : 0.35;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 16;
      ctx.shadowColor = color;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="relative w-56 h-56">
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-full neu-raised"
          style={{ backgroundColor: "var(--color-navy)" }}
        />
      </div>

      {/* Info */}
      <div className="text-center">
        <p className="text-lg font-medium text-text-primary">{displayFreq.toFixed(1)} Hz</p>
        <p className="text-sm text-text-secondary">{label}</p>
      </div>
    </div>
  );
}
