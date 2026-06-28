"use client";

import { useEffect, useRef } from "react";
import type { EegSample } from "@/lib/mind/types";
import { boostedPosition, gammaRatio } from "@/lib/mind/types";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

/**
 * MindArtCanvas — リアルタイム脳波ジェネレーティブ・アート。
 *
 * 設計資料（脳波 → 幾何学模様の連動）に従い、扫描中の脳波を万華鏡／曼荼羅状の
 * 図形にリアルタイム変換する：
 *   - Attention（集中度） → 模様の分割数・複雑さ・回転速度
 *   - Relaxation（リラックス度） → 線の滑らかさ（角→曲線）・色彩トーン（暖色→寒色）
 *   - ゾーン状態（両方高い） → 緻密だが動きは緩やか、金／紫の調和した曼荼羅
 *   - 脳波の乱れ／スパイク → 火花のような粒子（パーティクル）が飛び散る
 *   - 相対ガンマパワー → 中心の輝き・グロー強度の脈動
 */

interface ArtParams {
  attention: number; // 0-100
  meditation: number; // 0-100
  gamma: number; // 0-100 relative gamma power
  hasData: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // remaining, seconds
  max: number; // initial life
  hue: number;
}

function readNavy(): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--dyn-navy")
    .trim();
  return v || "#020617";
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function MindArtCanvas({
  sample,
  boost = 0,
}: {
  sample: EegSample | null;
  boost?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const paramsRef = useRef<ArtParams>({
    attention: 40,
    meditation: 40,
    gamma: 0,
    hasData: false,
  });
  // Last 1 Hz sample (gamma-boosted), for spike detection.
  const lastRef = useRef<{ attention: number; meditation: number; gamma: number } | null>(null);
  // Particles to emit on the next frame (consumed by the RAF loop).
  const burstRef = useRef(0);

  // Feed each sample into the animation loop without restarting it. A large
  // jump between consecutive samples (雑念・ビクッ) schedules a particle burst.
  useEffect(() => {
    if (!sample) {
      paramsRef.current = { ...paramsRef.current, hasData: false };
      return;
    }
    const eff = boostedPosition(sample.attention, sample.meditation, boost);
    const g = gammaRatio(sample);
    const prev = lastRef.current;
    if (prev) {
      const jump =
        Math.abs(eff.attention - prev.attention) +
        Math.abs(eff.meditation - prev.meditation) +
        Math.abs(g - prev.gamma);
      if (jump > 22) burstRef.current += Math.min(28, Math.round(jump));
    }
    lastRef.current = { attention: eff.attention, meditation: eff.meditation, gamma: g };
    paramsRef.current = {
      attention: eff.attention,
      meditation: eff.meditation,
      gamma: g,
      hasData: true,
    };
  }, [sample, boost]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cssW = 0;
    let cssH = 0;
    let last = performance.now();
    let navy = readNavy();

    // Smoothed live state.
    let att = 40;
    let med = 40;
    let gammaNow = 0;
    let rot = 0; // accumulated base rotation (rad)
    const particles: Particle[] = [];
    let visible = true; // false while scrolled out of view → pause drawing

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Prime the buffer with solid navy so the first frames fade cleanly.
      ctx.fillStyle = navy;
      ctx.fillRect(0, 0, cssW, cssH);
    };

    const onThemeChange = () => {
      navy = readNavy();
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

    // One closed polar curve with `segments`-fold rotational symmetry. The
    // shape blends between sharp spikes (tense) and smooth lobes (relaxed).
    const tracePolar = (
      cx: number,
      cy: number,
      baseR: number,
      segments: number,
      amp: number,
      roundness: number,
      phase: number
    ) => {
      const steps = Math.max(48, segments * 12);
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const wave = Math.cos(segments * a + phase);
        // Sharp cusps when tense; pure sinusoid lobes when relaxed.
        const spiky = Math.sign(wave) * Math.pow(Math.abs(wave), 3);
        const f = lerp(spiky, wave, roundness);
        const r = baseR * (1 + amp * f);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    const frame = (now: number) => {
      if (!visible) {
        last = now;
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000); // clamp on tab switches
      last = now;
      const p = paramsRef.current;

      // Frame-rate independent smoothing (gentle, for a flowing feel).
      const k = 1 - Math.exp(-dt * 2.5);
      const tAtt = p.hasData ? p.attention : 38;
      const tMed = p.hasData ? p.meditation : 38;
      const tGamma = p.hasData ? p.gamma : 6;
      att += (tAtt - att) * k;
      med += (tMed - med) * k;
      gammaNow += (tGamma - gammaNow) * k;

      const attN = att / 100;
      const medN = med / 100;
      const gN = Math.min(1, gammaNow / 100);
      const zone = attN * medN; // peaks only in the flow/Zone corner

      // ── Derived visual parameters (per the design table) ──
      const segments = Math.round(lerp(6, 18, attN)); // 集中→分割数・複雑さ
      const roundness = medN; // リラックス→角が取れて曲線的に
      // Attention speeds rotation; relaxation damps it → Zone is slow & smooth.
      const rotSpeed = (0.12 + attN * 0.95) * (1 - 0.6 * medN);
      rot += dt * rotSpeed;

      // Color: tense warm → relaxed cool, pulled toward gold in the Zone.
      const baseHue = lerp(16, 200, medN); // red/orange → teal/blue
      const hue = lerp(baseHue, 45, zone * 0.7); // 金色 in the Zone
      const accentHue = 280; // 神秘的な紫 highlight in the Zone
      const sat = lerp(45, 88, (attN + medN) / 2);

      const cx = cssW / 2;
      const cy = cssH / 2;
      const R = Math.min(cssW, cssH) * 0.42;

      // Motion-blur trail: paint a translucent navy veil instead of clearing,
      // so movement leaves a soft, smooth after-image.
      const [nr, ng, nb] = hexToRgb(navy);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(${nr}, ${ng}, ${nb}, ${lerp(0.14, 0.3, medN)})`;
      ctx.fillRect(0, 0, cssW, cssH);

      // Idle fast-path: with no EEG data, skip the heavy multi-ring shadowBlur
      // mandala and just show a calm dim core + waiting hint.
      if (!p.hasData) {
        const idleR = R * 0.22;
        const idleGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, idleR);
        idleGrad.addColorStop(0, "hsla(210, 40%, 60%, 0.28)");
        idleGrad.addColorStop(1, "hsla(210, 40%, 50%, 0)");
        ctx.fillStyle = idleGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, idleR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(200, 210, 230, 0.85)";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("データ待機中…", cx, cssH - 24);
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      // Glowing strokes add light where they overlap.
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const rings = 5;
      for (let kIdx = 0; kIdx < rings; kIdx++) {
        const f = kIdx / (rings - 1);
        const baseR = R * lerp(0.22, 1, f);
        const amp = lerp(0.28, 0.12, f) * lerp(1, 0.55, roundness); // tense = deeper spikes
        // Counter-rotate alternate rings for a kaleidoscopic weave.
        const dir = kIdx % 2 === 0 ? 1 : -1;
        const phase = rot * dir * (1 + kIdx * 0.12) + kIdx * 0.6;

        const ringHue = hue + (kIdx - rings / 2) * 10;
        const light = lerp(48, 70, gN) - f * 8;
        const alpha = lerp(0.7, 0.32, f);

        tracePolar(cx, cy, baseR, segments, amp, roundness, phase);
        ctx.shadowBlur = 6 + gN * 22;
        ctx.shadowColor = `hsla(${ringHue}, ${sat}%, ${light}%, 0.9)`;
        ctx.strokeStyle = `hsla(${ringHue}, ${sat}%, ${light}%, ${alpha})`;
        ctx.lineWidth = lerp(2.2, 1, f);
        ctx.stroke();

        // Faint fill on inner rings adds body to the mandala.
        if (kIdx < 2) {
          ctx.fillStyle = `hsla(${ringHue}, ${sat}%, ${light}%, ${0.05 + zone * 0.06})`;
          ctx.fill();
        }
      }

      // Central glow — brightness pulses with relative gamma power.
      const glowR = R * (0.18 + gN * 0.18);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      const coreHue = lerp(hue, accentHue, zone * 0.5);
      grad.addColorStop(0, `hsla(${coreHue}, ${sat}%, ${lerp(70, 92, gN)}%, ${0.5 + gN * 0.4})`);
      grad.addColorStop(1, `hsla(${coreHue}, ${sat}%, 60%, 0)`);
      ctx.shadowBlur = 0;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // ── Particles: emit scheduled bursts, then update & draw ──
      let toEmit = burstRef.current;
      burstRef.current = 0;
      if (toEmit > 0) {
        // Vary count without Math.random seed bias across resumes.
        toEmit = Math.min(toEmit, 40);
        for (let i = 0; i < toEmit; i++) {
          const a = Math.random() * Math.PI * 2;
          const speed = 60 + Math.random() * 180;
          const life = 0.6 + Math.random() * 0.8;
          particles.push({
            x: cx + Math.cos(a) * glowR * 0.6,
            y: cy + Math.sin(a) * glowR * 0.6,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            life,
            max: life,
            hue: hue + (Math.random() - 0.5) * 40,
          });
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.life -= dt;
        if (pt.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= 0.96;
        pt.vy *= 0.96;
        const t = pt.life / pt.max;
        const size = 1 + t * 2.5;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `hsla(${pt.hue}, 90%, 75%, ${t})`;
        ctx.fillStyle = `hsla(${pt.hue}, 90%, ${lerp(70, 95, t)}%, ${t})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";

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
