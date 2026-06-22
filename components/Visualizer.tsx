"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { getProgramById, isCustomProgramId, type CustomProgram } from "@/lib/programs";
import { getCurrentPhaseInfo } from "@/lib/utils";
import { getAudioLevel } from "@/lib/audio-analyser";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

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

/** "#rrggbb" → [r,g,b] in 0..1 for WebGL uniforms. */
function hexToVec3(hex: string, fallback: [number, number, number]): [number, number, number] {
  const h = hex.trim().replace("#", "");
  if (h.length < 6) return fallback;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return fallback;
  return [r / 255, g / 255, b / 255];
}

interface CymaticsParams {
  isPlaying: boolean;
  sym: number; // target N-fold symmetry
  ring: number; // target radial ring density
  spin: number; // target spin speed (rad/s)
}

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_symmetry;
uniform float u_radialMode;
uniform vec3  u_colorA;
uniform vec3  u_colorB;
uniform vec3  u_bg;
uniform float u_level;     // 0..1 live audio amplitude
uniform float u_intensity; // 0..1 playing vs idle
uniform float u_spin;      // accumulated rotation phase (rad)

const float PI = 3.14159265;

void main() {
  // Centered square coords in -1..1 (canvas is square).
  vec2 p = (v_uv - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x) + u_spin;

  // Audio breathing: gently expand/contract radial scale.
  float breathe = 1.0 + u_level * 0.18;
  float rr = r / breathe;

  // Angular harmonics: N-fold petals + a detuned overtone for intricacy.
  float ang  = cos(u_symmetry * a);
  float ang2 = cos((u_symmetry * 2.0) * a + 1.5708);

  // Concentric radial standing waves travelling inward over time + overtone.
  float radA = sin(u_radialMode * rr * PI - u_time * 1.2);
  float radB = sin((u_radialMode * 1.6) * rr * PI + u_time * 0.7);

  float field = ang * radA + 0.6 * ang2 * radB;

  // Nodal lines: thin bright filaments where the field crosses zero.
  float lineW = 0.06 + 0.04 * (1.0 - u_intensity);
  float lines = 1.0 - smoothstep(0.0, lineW, abs(field));

  // Soft glow toward the center.
  float glow = smoothstep(1.0, 0.0, rr) * 0.5;

  float bright = (lines + glow) * (0.55 + 0.45 * u_intensity) * (0.85 + 0.30 * u_level);

  // Color: mix the two theme colors by radius, scaled by brightness.
  vec3 col = mix(u_colorA, u_colorB, clamp(rr, 0.0, 1.0)) * bright;

  // Circular vignette: fade to background near the rim so corners match navy.
  float vig = smoothstep(1.0, 0.86, r);
  vec3 outc = mix(u_bg, u_bg + col, vig);

  gl_FragColor = vec4(outc, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("[cymatics] shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
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
  const paramsRef = useRef<CymaticsParams>({
    isPlaying: false,
    sym: 6,
    ring: 5,
    spin: 0.1,
  });

  // ── Resolve what's playing: binaural program vs custom (synth) program ──
  const isCustom = isCustomProgramId(programId);
  const program = isCustom ? undefined : getProgramById(programId);
  const customProgram = isCustom
    ? savedPrograms.find((p) => p.id === programId) ??
      publishedPrograms.find((p) => p.id === programId)
    : undefined;

  let driveFreq: number;
  let targetSym: number;
  let targetRing: number;
  let targetSpin: number;
  let displayFreq: number;
  let label: string;

  if (isCustom) {
    driveFreq = customProgram ? dominantFrequency(customProgram) : 0;
    targetSym = symmetryForFreq(driveFreq);
    targetRing = radialModeForFreq(driveFreq);
    targetSpin = 0.1;
    displayFreq = driveFreq;
    label = customProgram?.name ?? "カスタム";
  } else {
    const timeScale = program ? timerDuration / program.defaultDuration : 1;
    const scaledElapsed = elapsed / timeScale;
    const info = program
      ? getCurrentPhaseInfo(program.phases, scaledElapsed)
      : { phase: null, beatFreq: 0 };
    driveFreq = info.beatFreq;
    targetSym = symmetryForBeat(info.beatFreq);
    targetRing = radialModeForFreq(info.beatFreq);
    targetSpin = 0.06 + info.beatFreq * 0.01;
    displayFreq =
      info.phase?.name === "導入" && program ? program.targetBeatFreq : info.beatFreq;
    label = info.phase ? info.phase.name : "待機中";
  }

  // Feed latest targets into the animation loop without restarting it.
  useEffect(() => {
    paramsRef.current = { isPlaying, sym: targetSym, ring: targetRing, spin: targetSpin };
  }, [isPlaying, targetSym, targetRing, targetSpin]);

  // Start the WebGL render loop once; it reads paramsRef each frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Fallback: fill navy via 2D if WebGL is unavailable ──
    const fallbackFill = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#040711";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let uniforms: Record<string, WebGLUniformLocation | null> = {};
    let lost = false;

    // Glowing nodal lines use the theme primary/accent; the mandala backdrop is
    // always a deep dark navy (independent of the circadian theme) so the
    // filaments pop like the magazine's water-mandala plates regardless of the
    // daytime/night palette.
    let colorA: [number, number, number] = [0.39, 0.4, 0.95];
    let colorB: [number, number, number] = [0.51, 0.55, 0.97];
    const bg: [number, number, number] = [0.016, 0.027, 0.067];
    const readColors = () => {
      const css = getComputedStyle(document.documentElement);
      colorA = hexToVec3(css.getPropertyValue("--dyn-primary"), colorA);
      colorB = hexToVec3(css.getPropertyValue("--dyn-accent"), colorB);
    };

    const initGL = (): boolean => {
      gl = canvas.getContext("webgl", {
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: false,
      });
      if (!gl) return false;

      const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
      if (!vs || !fs) return false;
      const prog = gl.createProgram();
      if (!prog) return false;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("[cymatics] link error:", gl.getProgramInfoLog(prog));
        return false;
      }
      program = prog;
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      // Full-screen quad as a triangle strip.
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );
      const loc = gl.getAttribLocation(prog, "a_pos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      for (const name of [
        "u_time",
        "u_symmetry",
        "u_radialMode",
        "u_colorA",
        "u_colorB",
        "u_bg",
        "u_level",
        "u_intensity",
        "u_spin",
      ]) {
        uniforms[name] = gl.getUniformLocation(prog, name);
      }
      return true;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
      if (gl) gl.viewport(0, 0, w, h);
    };

    if (!initGL()) {
      resize();
      fallbackFill();
      return;
    }
    readColors();
    resize();

    window.addEventListener("resize", resize);
    window.addEventListener(THEME_CHANGE_EVENT, readColors);

    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    const onRestored = () => {
      uniforms = {};
      program = null;
      if (initGL()) {
        readColors();
        resize();
        lost = false;
        rafRef.current = requestAnimationFrame(frame);
      }
    };
    canvas.addEventListener("webglcontextlost", onLost as EventListener);
    canvas.addEventListener("webglcontextrestored", onRestored as EventListener);

    // Eased per-frame state.
    let symNow = paramsRef.current.sym;
    let ringNow = paramsRef.current.ring;
    let spinNow = paramsRef.current.spin;
    let intensityNow = 0.35;
    let levelNow = 0;
    let time = 0;
    let spinPhase = 0;
    let last = performance.now();
    let lastColor = 0;

    const frame = (now: number) => {
      if (lost || !gl || !program) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;

      if (now - lastColor > 800) {
        readColors();
        lastColor = now;
      }

      const p = paramsRef.current;
      const k = Math.min(1, dt * 2.0);
      symNow += (p.sym - symNow) * k;
      ringNow += (p.ring - ringNow) * k;
      const targetSpinSpeed = p.isPlaying ? p.spin : 0.04;
      spinNow += (targetSpinSpeed - spinNow) * k;
      spinPhase += spinNow * dt;
      intensityNow += ((p.isPlaying ? 1 : 0.35) - intensityNow) * k;
      const lvl = getAudioLevel();
      levelNow += (lvl - levelNow) * Math.min(1, dt * 6);

      gl.useProgram(program);
      gl.uniform1f(uniforms.u_time, time);
      gl.uniform1f(uniforms.u_symmetry, symNow);
      gl.uniform1f(uniforms.u_radialMode, ringNow);
      gl.uniform3fv(uniforms.u_colorA, colorA);
      gl.uniform3fv(uniforms.u_colorB, colorB);
      gl.uniform3fv(uniforms.u_bg, bg);
      gl.uniform1f(uniforms.u_level, levelNow);
      gl.uniform1f(uniforms.u_intensity, intensityNow);
      gl.uniform1f(uniforms.u_spin, spinPhase);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener(THEME_CHANGE_EVENT, readColors);
      canvas.removeEventListener("webglcontextlost", onLost as EventListener);
      canvas.removeEventListener("webglcontextrestored", onRestored as EventListener);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="relative w-56 h-56">
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-full neu-raised"
          style={{ backgroundColor: "#040711" }}
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
