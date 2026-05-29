"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getProgramById } from "@/lib/programs";
import { getCurrentPhaseInfo } from "@/lib/utils";

/**
 * Map a beat frequency (Hz) to a Lissajous integer ratio a:b.
 * Lower brainwave bands → fewer lobes (calmer); higher bands → more lobes (busier).
 */
function ratioForBeat(beatFreq: number): [number, number] {
  if (beatFreq < 4) return [2, 1]; // delta
  if (beatFreq < 13) return [3, 2]; // theta / alpha
  if (beatFreq < 30) return [4, 3]; // beta
  return [5, 4]; // gamma
}

interface LissajousParams {
  isPlaying: boolean;
  beatFreq: number;
  targetA: number;
  targetB: number;
}

export default function Visualizer() {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const elapsed = useAppStore((s) => s.elapsed);
  const programId = useAppStore((s) => s.selectedProgramId);
  const timerDuration = useAppStore((s) => s.timerDuration);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const paramsRef = useRef<LissajousParams>({
    isPlaying: false,
    beatFreq: 0,
    targetA: 3,
    targetB: 2,
  });

  // ── Derive current phase / beat (same logic the pulse-ring visual used) ──
  const program = getProgramById(programId);
  const timeScale = program ? timerDuration / program.defaultDuration : 1;
  const scaledElapsed = elapsed / timeScale;
  const { phase, beatFreq } = program
    ? getCurrentPhaseInfo(program.phases, scaledElapsed)
    : { phase: null, beatFreq: 0 };
  const displayFreq =
    phase?.name === "導入" && program ? program.targetBeatFreq : beatFreq;

  // Feed the latest values into the animation loop without restarting it.
  useEffect(() => {
    const [a, b] = ratioForBeat(beatFreq);
    paramsRef.current = { isPlaying, beatFreq, targetA: a, targetB: b };
  }, [isPlaying, beatFreq]);

  // Start the requestAnimationFrame loop once; it reads paramsRef each frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let a = paramsRef.current.targetA;
    let b = paramsRef.current.targetB;
    let delta = 0;
    let last = performance.now();
    let cssW = 0;
    let cssH = 0;

    // Theme colours (read from the dynamic circadian palette; refreshed ~1s).
    let color = "#6366F1";
    let bg = "#020617";
    let lastStyle = 0;
    const readStyle = () => {
      const root = getComputedStyle(document.documentElement);
      const p = root.getPropertyValue("--dyn-primary").trim();
      const n = root.getPropertyValue("--dyn-navy").trim();
      if (p) color = p;
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
      // Opaque base so the phosphor trail has something to fade into.
      ctx.globalAlpha = 1;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cssW, cssH);
    };

    readStyle();
    resize();
    window.addEventListener("resize", resize);

    const POINTS = 360;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // clamp (tab switches)
      last = now;
      if (now - lastStyle > 800) {
        readStyle();
        lastStyle = now;
      }
      const p = paramsRef.current;

      // Ease the ratio toward its target so phase changes morph smoothly.
      const k = Math.min(1, dt * 1.5);
      a += (p.targetA - a) * k;
      b += (p.targetB - b) * k;

      // Phase precession: faster beat → faster rotation; gentle idle spin.
      const speed = p.isPlaying ? 0.15 + p.beatFreq * 0.06 : 0.05;
      delta += speed * dt;

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
        <p className="text-lg font-medium text-text-primary">
          {displayFreq.toFixed(1)} Hz
        </p>
        <p className="text-sm text-text-secondary">{phase ? phase.name : "待機中"}</p>
      </div>
    </div>
  );
}
