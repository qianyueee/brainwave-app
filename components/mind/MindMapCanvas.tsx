"use client";

import { useEffect, useRef } from "react";
import type { EegSample } from "@/lib/mind/types";
import { getQuadrant, gammaRatio, QUADRANT_INFO } from "@/lib/mind/types";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

interface MapParams {
  targetX: number; // 0-1, right = relaxed
  targetY: number; // 0-1, up = focused (already inverted to canvas space)
  gamma: number; // 0-100 relative gamma power
  color: string; // hex of current quadrant
  hasData: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Corner tint + label layout. Y axis: attention up, X axis: relaxation right. */
const CORNERS = [
  { quadrant: "stress", x: 0, y: 0, alignX: "left", alignY: "top" },
  { quadrant: "flow", x: 1, y: 0, alignX: "right", alignY: "top" },
  { quadrant: "fatigue", x: 0, y: 1, alignX: "left", alignY: "bottom" },
  { quadrant: "deepMeditation", x: 1, y: 1, alignX: "right", alignY: "bottom" },
] as const;

const TRAIL_MAX = 200; // ≈20 s at one point per 100 ms
const TRAIL_INTERVAL_MS = 100;

export default function MindMapCanvas({ sample }: { sample: EegSample | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const paramsRef = useRef<MapParams>({
    targetX: 0.5,
    targetY: 0.5,
    gamma: 0,
    color: QUADRANT_INFO.flow.color,
    hasData: false,
  });

  // Feed the latest sample into the animation loop without restarting it.
  useEffect(() => {
    if (!sample) {
      paramsRef.current = { ...paramsRef.current, hasData: false };
      return;
    }
    const quadrant = getQuadrant(sample.attention, sample.meditation);
    paramsRef.current = {
      targetX: sample.meditation / 100,
      targetY: 1 - sample.attention / 100,
      gamma: gammaRatio(sample),
      color: QUADRANT_INFO[quadrant].color,
      hasData: true,
    };
  }, [sample]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cssW = 0;
    let cssH = 0;
    let last = performance.now();

    // Normalized (0-1) coords so the trail survives resizes.
    let x = 0.5;
    let y = 0.5;
    let rgb = hexToRgb(paramsRef.current.color);
    let gammaNow = 0;
    const trail: { x: number; y: number }[] = [];
    let lastTrailAt = 0;

    // ── Static background (axes, quadrant tints, labels) on an offscreen canvas ──
    const bgCanvas = document.createElement("canvas");
    let bg = "#020617";

    const paintBackground = () => {
      const bgCtx = bgCanvas.getContext("2d");
      if (!bgCtx || cssW === 0 || cssH === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      bgCanvas.width = Math.round(cssW * dpr);
      bgCanvas.height = Math.round(cssH * dpr);
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const navy = getComputedStyle(document.documentElement)
        .getPropertyValue("--dyn-navy")
        .trim();
      if (navy) bg = navy;
      bgCtx.fillStyle = bg;
      bgCtx.fillRect(0, 0, cssW, cssH);

      // Quadrant tints: soft radial glow from each corner.
      const radius = Math.max(cssW, cssH) * 0.62;
      for (const c of CORNERS) {
        const [r, g, b] = hexToRgb(QUADRANT_INFO[c.quadrant].color);
        const cx = c.x * cssW;
        const cy = c.y * cssH;
        const grad = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.16)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        bgCtx.fillStyle = grad;
        bgCtx.fillRect(0, 0, cssW, cssH);
      }

      // Center cross axes.
      bgCtx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      bgCtx.lineWidth = 1;
      bgCtx.beginPath();
      bgCtx.moveTo(cssW / 2, 8);
      bgCtx.lineTo(cssW / 2, cssH - 8);
      bgCtx.moveTo(8, cssH / 2);
      bgCtx.lineTo(cssW - 8, cssH / 2);
      bgCtx.stroke();

      // Quadrant labels in the corners.
      bgCtx.font = "bold 14px sans-serif";
      for (const c of CORNERS) {
        const info = QUADRANT_INFO[c.quadrant];
        const [r, g, b] = hexToRgb(info.color);
        bgCtx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
        bgCtx.textAlign = c.alignX;
        bgCtx.textBaseline = c.alignY;
        bgCtx.fillText(
          info.label,
          c.x === 0 ? 12 : cssW - 12,
          c.y === 0 ? 12 : cssH - 12
        );
      }

      // Axis captions along the center cross.
      bgCtx.fillStyle = "rgba(255, 255, 255, 0.4)";
      bgCtx.font = "12px sans-serif";
      bgCtx.textAlign = "right";
      bgCtx.textBaseline = "top";
      bgCtx.fillText("リラックス →", cssW - 12, cssH / 2 + 6);
      bgCtx.textAlign = "left";
      bgCtx.fillText("↑ 集中", cssW / 2 + 6, 28);
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
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener(THEME_CHANGE_EVENT, paintBackground);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // clamp (tab switches)
      last = now;
      const p = paramsRef.current;

      // Frame-rate independent lerp (≈0.07/frame at 60 fps, spec k≈0.05-0.1).
      const k = 1 - Math.exp(-dt * 4);
      x += (p.targetX - x) * k;
      y += (p.targetY - y) * k;
      gammaNow += (p.gamma - gammaNow) * k;

      // Ease the quadrant colour per channel to avoid hard switches.
      const target = hexToRgb(p.color);
      rgb = [
        rgb[0] + (target[0] - rgb[0]) * k,
        rgb[1] + (target[1] - rgb[1]) * k,
        rgb[2] + (target[2] - rgb[2]) * k,
      ];
      const colorAt = (alpha: number) =>
        `rgba(${rgb[0].toFixed(0)}, ${rgb[1].toFixed(0)}, ${rgb[2].toFixed(0)}, ${alpha.toFixed(3)})`;

      if (p.hasData && now - lastTrailAt >= TRAIL_INTERVAL_MS) {
        trail.push({ x, y });
        if (trail.length > TRAIL_MAX) trail.shift();
        lastTrailAt = now;
      }

      ctx.clearRect(0, 0, cssW, cssH);
      ctx.drawImage(bgCanvas, 0, 0, cssW, cssH);

      if (!p.hasData) {
        // Idle: dim dot at center + waiting text.
        ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
        ctx.beginPath();
        ctx.arc(cssW / 2, cssH / 2, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("データ待機中…", cssW / 2, cssH / 2 + 18);
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      // Fading trail.
      if (trail.length > 1) {
        ctx.globalCompositeOperation = "lighter";
        const n = trail.length;
        for (let i = 1; i < n; i++) {
          const t = i / n;
          ctx.strokeStyle = colorAt(t * 0.55);
          ctx.lineWidth = 1 + t * 2;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x * cssW, trail[i - 1].y * cssH);
          ctx.lineTo(trail[i].x * cssW, trail[i].y * cssH);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
      }

      // Glowing dot: size and glow scale with relative gamma power.
      const px = x * cssW;
      const py = y * cssH;
      const radius = 8 + (gammaNow / 100) * 14;
      ctx.shadowBlur = 16 + gammaNow * 0.6;
      ctx.shadowColor = colorAt(1);
      ctx.fillStyle = colorAt(0.9);
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
      window.removeEventListener(THEME_CHANGE_EVENT, paintBackground);
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
