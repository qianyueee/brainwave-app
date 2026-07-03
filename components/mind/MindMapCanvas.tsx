"use client";

import { useEffect, useRef } from "react";
import type { EegSample, Quadrant } from "@/lib/mind/types";
import { getQuadrant, gammaRatio, boostedPosition, QUADRANT_INFO } from "@/lib/mind/types";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

interface MapParams {
  targetX: number; // 0-1, right = relaxed
  targetY: number; // 0-1, up = focused (already inverted to canvas space)
  gamma: number; // 0-100 relative gamma power
  quadrant: Quadrant;
  hasData: boolean;
}

/**
 * Trail retention mode.
 * - rolling: idle behavior — short fading tail behind the dot.
 * - accumulating: a measurement is running — every point is kept and painted
 *   onto a persistent layer, so dwell areas build up visibly.
 * - frozen: the measurement ended — the accumulated trail stays on screen
 *   (the live dot keeps moving on top) until the next measurement starts.
 */
type TrailMode = "rolling" | "accumulating" | "frozen";

/** Safety cap on retained points (~72 min at one point per 100 ms). */
const RETAINED_MAX = 43200;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Quadrant label layout. Y axis: attention up, X axis: relaxation right. */
const CORNERS: {
  quadrant: Quadrant;
  x: 0 | 1;
  y: 0 | 1;
  alignX: CanvasTextAlign;
  alignY: CanvasTextBaseline;
}[] = [
  { quadrant: "stress", x: 0, y: 0, alignX: "left", alignY: "top" },
  { quadrant: "flow", x: 1, y: 0, alignX: "right", alignY: "top" },
  { quadrant: "fatigue", x: 0, y: 1, alignX: "left", alignY: "bottom" },
  { quadrant: "deepMeditation", x: 1, y: 1, alignX: "right", alignY: "bottom" },
];

const TRAIL_MAX = 200; // ≈20 s at one point per 100 ms (rolling mode)
const TRAIL_INTERVAL_MS = 100;

/** Quadrant of a normalized canvas point (x right = relaxed, y down). */
function quadrantAt(x: number, y: number): Quadrant {
  return getQuadrant((1 - y) * 100, x * 100);
}

const zeroCounts = (): Record<Quadrant, number> => ({
  flow: 0,
  stress: 0,
  fatigue: 0,
  deepMeditation: 0,
});

/** Theme palette read from the circadian CSS vars. */
interface ThemeColors {
  navy: string;
  primary: string;
  accent: string;
  textPrimary: string;
  textSecondary: string;
}

function readThemeColors(): ThemeColors {
  const get = (name: string, fallback: string) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  };
  return {
    navy: get("--dyn-navy", "#020617"),
    primary: get("--dyn-primary", "#4a7fd4"),
    accent: get("--dyn-accent", "#6b6baa"),
    textPrimary: get("--dyn-text-primary", "#d0d8e8"),
    textSecondary: get("--dyn-text-secondary", "#8890a8"),
  };
}

export default function MindMapCanvas({
  sample,
  boost = 0,
  isRecording = false,
}: {
  sample: EegSample | null;
  boost?: number;
  isRecording?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const paramsRef = useRef<MapParams>({
    targetX: 0.5,
    targetY: 0.5,
    gamma: 0,
    quadrant: "flow",
    hasData: false,
  });

  // Trail state lives in refs so the measurement-driven mode switches reach
  // the long-lived animation loop without restarting it.
  const modeRef = useRef<TrailMode>("rolling");
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const countsRef = useRef<Record<Quadrant, number>>(zeroCounts());
  // Signals the loop to wipe and rebuild the persistent trail layer.
  const trailLayerDirtyRef = useRef(false);

  // Feed the latest sample into the animation loop without restarting it.
  // Position uses the gamma-boosted attention/meditation so a 40Hz-driven
  // gamma rise pulls the dot toward the Zone; the glow still tracks raw gamma.
  useEffect(() => {
    if (!sample) {
      paramsRef.current = { ...paramsRef.current, hasData: false };
      return;
    }
    const eff = boostedPosition(sample.attention, sample.meditation, boost);
    paramsRef.current = {
      targetX: eff.meditation / 100,
      targetY: 1 - eff.attention / 100,
      gamma: gammaRatio(sample),
      quadrant: getQuadrant(eff.attention, eff.meditation),
      hasData: true,
    };
  }, [sample, boost]);

  // Measurement start: wipe the trail and begin retaining every point.
  // Measurement end: freeze the retained trail so the map can be studied.
  useEffect(() => {
    if (isRecording) {
      trailRef.current = [];
      countsRef.current = zeroCounts();
      modeRef.current = "accumulating";
      trailLayerDirtyRef.current = true;
    } else if (modeRef.current === "accumulating") {
      modeRef.current = "frozen";
    }
  }, [isRecording]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cssW = 0;
    let cssH = 0;
    let last = performance.now();
    let colors = readThemeColors();

    let x = 0.5;
    let y = 0.5;
    let gammaNow = 0;
    let lastTrailAt = 0;
    let visible = true; // false while scrolled out of view → pause drawing

    // ── Static background (subtle tints + axes) on an offscreen canvas ──
    const bgCanvas = document.createElement("canvas");
    // ── Persistent trail layer (accumulating/frozen modes) ──
    const trailCanvas = document.createElement("canvas");

    const paintBackground = () => {
      const bgCtx = bgCanvas.getContext("2d");
      if (!bgCtx || cssW === 0 || cssH === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      bgCanvas.width = Math.round(cssW * dpr);
      bgCanvas.height = Math.round(cssH * dpr);
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      bgCtx.fillStyle = colors.navy;
      bgCtx.fillRect(0, 0, cssW, cssH);

      // One calm tint: a soft primary glow toward the goal corner (flow,
      // top-right) and a faint accent counterweight bottom-left.
      const radius = Math.max(cssW, cssH) * 0.85;
      const flowGrad = bgCtx.createRadialGradient(cssW, 0, 0, cssW, 0, radius);
      flowGrad.addColorStop(0, rgba(colors.primary, 0.14));
      flowGrad.addColorStop(1, rgba(colors.primary, 0));
      bgCtx.fillStyle = flowGrad;
      bgCtx.fillRect(0, 0, cssW, cssH);

      const lowGrad = bgCtx.createRadialGradient(0, cssH, 0, 0, cssH, radius);
      lowGrad.addColorStop(0, rgba(colors.accent, 0.08));
      lowGrad.addColorStop(1, rgba(colors.accent, 0));
      bgCtx.fillStyle = lowGrad;
      bgCtx.fillRect(0, 0, cssW, cssH);

      // Center cross axes.
      bgCtx.strokeStyle = rgba(colors.textSecondary, 0.25);
      bgCtx.lineWidth = 1;
      bgCtx.beginPath();
      bgCtx.moveTo(cssW / 2, 8);
      bgCtx.lineTo(cssW / 2, cssH - 8);
      bgCtx.moveTo(8, cssH / 2);
      bgCtx.lineTo(cssW - 8, cssH / 2);
      bgCtx.stroke();

      // Axis captions along the center cross.
      bgCtx.fillStyle = rgba(colors.textSecondary, 0.7);
      bgCtx.font = "12px sans-serif";
      bgCtx.textAlign = "right";
      bgCtx.textBaseline = "top";
      bgCtx.fillText("リラックス →", cssW - 12, cssH / 2 + 6);
      bgCtx.textAlign = "left";
      bgCtx.fillText("↑ 集中", cssW / 2 + 6, 28);
    };

    /** One retained-trail segment, painted onto the persistent layer. Constant
     *  low alpha so repeated passes through the same area stack up brighter —
     *  the layer doubles as a dwell-density map. */
    const strokeRetainedSegment = (
      tCtx: CanvasRenderingContext2D,
      from: { x: number; y: number },
      to: { x: number; y: number }
    ) => {
      tCtx.strokeStyle = rgba(colors.primary, 0.28);
      tCtx.lineWidth = 1.5;
      tCtx.lineCap = "round";
      tCtx.beginPath();
      tCtx.moveTo(from.x * cssW, from.y * cssH);
      tCtx.lineTo(to.x * cssW, to.y * cssH);
      tCtx.stroke();
    };

    /** Rebuild the whole persistent layer (resize / theme change / wipe). */
    const repaintTrailLayer = () => {
      const tCtx = trailCanvas.getContext("2d");
      if (!tCtx || cssW === 0 || cssH === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      trailCanvas.width = Math.round(cssW * dpr);
      trailCanvas.height = Math.round(cssH * dpr);
      tCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pts = trailRef.current;
      if (modeRef.current === "rolling" || pts.length < 2) return;
      for (let i = 1; i < pts.length; i++) {
        strokeRetainedSegment(tCtx, pts[i - 1], pts[i]);
      }
    };

    const onThemeChange = () => {
      colors = readThemeColors();
      paintBackground();
      repaintTrailLayer();
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const rect = canvas.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintBackground();
      repaintTrailLayer();
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);

    // Pause the render loop while the canvas is scrolled out of view.
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          visible = entries[0]?.isIntersecting ?? true;
        },
        { rootMargin: "100px" }
      );
      io.observe(canvas);
    }

    const drawLabels = (activeQuadrant: Quadrant, hasData: boolean) => {
      // Labels per frame so the current quadrant can be highlighted in the
      // high-contrast text color regardless of the palette underneath.
      const counts = countsRef.current;
      const total =
        counts.flow + counts.stress + counts.fatigue + counts.deepMeditation;
      const showShare = modeRef.current !== "rolling" && total > 0;
      const maxCount = Math.max(
        counts.flow,
        counts.stress,
        counts.fatigue,
        counts.deepMeditation
      );

      for (const c of CORNERS) {
        const active = hasData && c.quadrant === activeQuadrant;
        ctx.font = active ? "bold 14px sans-serif" : "13px sans-serif";
        ctx.fillStyle = active
          ? colors.textPrimary
          : rgba(colors.textSecondary, 0.8);
        ctx.textAlign = c.alignX;
        ctx.textBaseline = c.alignY;
        const lx = c.x === 0 ? 12 : cssW - 12;
        const ly = c.y === 0 ? 12 : cssH - 12;
        ctx.fillText(QUADRANT_INFO[c.quadrant].label, lx, ly);

        // Time share per quadrant while measuring / after 測定終了 — the
        // biggest share is highlighted so the dominant state reads at a glance.
        if (showShare) {
          const share = Math.round((counts[c.quadrant] / total) * 100);
          const isMax = counts[c.quadrant] === maxCount && maxCount > 0;
          ctx.font = isMax ? "bold 15px sans-serif" : "13px sans-serif";
          ctx.fillStyle = isMax
            ? colors.textPrimary
            : rgba(colors.textSecondary, 0.85);
          ctx.fillText(`${share}%`, lx, c.y === 0 ? ly + 20 : ly - 20);
        }
      }
    };

    const frame = (now: number) => {
      if (!visible) {
        last = now;
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000); // clamp (tab switches)
      last = now;
      const p = paramsRef.current;

      // Frame-rate independent lerp (≈0.07/frame at 60 fps, spec k≈0.05-0.1).
      const k = 1 - Math.exp(-dt * 4);
      x += (p.targetX - x) * k;
      y += (p.targetY - y) * k;
      gammaNow += (p.gamma - gammaNow) * k;

      if (trailLayerDirtyRef.current) {
        trailLayerDirtyRef.current = false;
        repaintTrailLayer();
      }

      const mode = modeRef.current;
      const trail = trailRef.current;
      if (
        p.hasData &&
        mode !== "frozen" &&
        now - lastTrailAt >= TRAIL_INTERVAL_MS
      ) {
        const prev = trail.length ? trail[trail.length - 1] : null;
        if (mode === "accumulating") {
          if (trail.length < RETAINED_MAX) {
            trail.push({ x, y });
            countsRef.current[quadrantAt(x, y)] += 1;
            const tCtx = trailCanvas.getContext("2d");
            if (tCtx && prev) strokeRetainedSegment(tCtx, prev, { x, y });
          }
        } else {
          trail.push({ x, y });
          if (trail.length > TRAIL_MAX) trail.shift();
        }
        lastTrailAt = now;
      }

      ctx.clearRect(0, 0, cssW, cssH);
      ctx.drawImage(bgCanvas, 0, 0, cssW, cssH);
      // Retained measurement trail (during + after 測定, until the next start).
      if (mode !== "rolling") ctx.drawImage(trailCanvas, 0, 0, cssW, cssH);
      drawLabels(p.quadrant, p.hasData);

      if (!p.hasData) {
        // Idle: dim dot at center + waiting text.
        ctx.fillStyle = rgba(colors.textSecondary, 0.4);
        ctx.beginPath();
        ctx.arc(cssW / 2, cssH / 2, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(colors.textSecondary, 0.9);
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("データ待機中…", cssW / 2, cssH / 2 + 18);
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      // Fading tail behind the dot in the theme primary (plain alpha
      // compositing so it stays visible on light palettes too). Each segment
      // is a quadratic curve through the midpoints with the sampled point as
      // the control handle, so it reads as one smooth, flowing path. In
      // accumulating mode only the most recent points get this bright tail —
      // the full history is on the persistent layer underneath; frozen mode
      // shows the persistent layer alone.
      const tailPts =
        mode === "rolling"
          ? trail
          : mode === "accumulating"
            ? trail.slice(-40)
            : [];
      if (tailPts.length > 1) {
        const n = tailPts.length;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const pts = tailPts.map((pt) => ({ x: pt.x * cssW, y: pt.y * cssH }));
        for (let i = 0; i < n - 1; i++) {
          const t = (i + 1) / n;
          const p0 = pts[i];
          const p1 = pts[i + 1];
          const start =
            i === 0
              ? p0
              : { x: (pts[i - 1].x + p0.x) / 2, y: (pts[i - 1].y + p0.y) / 2 };
          const end =
            i === n - 2
              ? p1
              : { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
          ctx.strokeStyle = rgba(colors.primary, t * 0.5);
          ctx.lineWidth = 1 + t * 2;
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.quadraticCurveTo(p0.x, p0.y, end.x, end.y);
          ctx.stroke();
        }
      }

      // Glowing dot: size and glow scale with relative gamma power.
      const px = x * cssW;
      const py = y * cssH;
      const radius = 8 + (gammaNow / 100) * 14;
      ctx.shadowBlur = 16 + gammaNow * 0.6;
      ctx.shadowColor = colors.primary;
      ctx.fillStyle = rgba(colors.primary, 0.95);
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(px, py, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
      io?.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full aspect-square rounded-3xl neu-raised"
      style={{ backgroundColor: "var(--color-navy)" }}
    />
  );
}
