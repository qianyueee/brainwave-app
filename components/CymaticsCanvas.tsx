"use client";

import { useEffect, useRef } from "react";
import { getAudioLevel } from "@/lib/audio-analyser";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

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

export interface CymaticsParams {
  isPlaying: boolean;
  sym: number; // target N-fold symmetry
  ring: number; // target radial ring density
  spin: number; // target spin speed (rad/s)
  seed: number; // per-program fingerprint 0..1
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
uniform float u_seed;      // 0..1 per-program fingerprint

const float PI = 3.14159265;

void main() {
  // Centered square coords in -1..1 (canvas is square).
  vec2 p = (v_uv - 0.5) * 2.0;
  float r = length(p);
  // Per-program angular phase offset so each program looks distinct.
  float a = atan(p.y, p.x) + u_spin + u_seed * 6.2831853;

  // Audio breathing: gently expand/contract radial scale.
  float breathe = 1.0 + u_level * 0.18;
  float rr = r / breathe;

  // Angular harmonics: N-fold petals + a detuned overtone for intricacy.
  // The overtone phase + radial overtone ratio vary with the seed so two
  // programs with similar petal counts still read differently.
  float ang  = cos(u_symmetry * a);
  float ang2 = cos((u_symmetry * 2.0) * a + 1.5708 + u_seed * 3.1416);

  // Concentric radial standing waves travelling inward over time + overtone.
  float radA = sin(u_radialMode * rr * PI - u_time * 1.2);
  float radB = sin((u_radialMode * (1.4 + u_seed * 0.6)) * rr * PI + u_time * 0.7);

  float field = ang * radA + 0.6 * ang2 * radB;

  // Nodal lines: thin bright filaments where the field crosses zero — the
  // main feature (keeps the look as "glowing filaments on dark", never a
  // flooded disc, even when the theme color is pale).
  float lineW = 0.05 + 0.04 * (1.0 - u_intensity);
  float lines = 1.0 - smoothstep(0.0, lineW, abs(field));

  float bright = lines * (0.6 + 0.4 * u_intensity) * (0.85 + 0.30 * u_level);
  vec3 col = mix(u_colorA, u_colorB, clamp(rr, 0.0, 1.0)) * bright;

  // Subtle central glow, kept low so it never blooms to white.
  float center = smoothstep(0.85, 0.0, rr) * 0.16 * (0.6 + 0.4 * u_intensity);
  vec3 glowCol = mix(u_colorA, u_colorB, 0.5) * center;

  // Circular vignette: fade to background near the rim so corners match navy.
  float vig = smoothstep(1.0, 0.86, r);
  vec3 outc = mix(u_bg, u_bg + col + glowCol, vig);

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

/**
 * Self-contained WebGL renderer for the cymatics / water-mandala visual.
 * Takes frequency-derived params as props and runs its own RAF loop (no React
 * re-renders). Used both for the small player visualizer and the fullscreen
 * overlay — each instance renders independently from the same params.
 */
export default function CymaticsCanvas({
  isPlaying,
  sym,
  ring,
  spin,
  seed,
  className,
  style,
}: CymaticsParams & { className?: string; style?: React.CSSProperties }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const paramsRef = useRef<CymaticsParams>({ isPlaying, sym, ring, spin, seed });

  // Feed latest targets into the animation loop without restarting it.
  useEffect(() => {
    paramsRef.current = { isPlaying, sym, ring, spin, seed };
  }, [isPlaying, sym, ring, spin, seed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
        "u_seed",
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

    const IDLE_INTENSITY = 0.7;
    let symNow = paramsRef.current.sym;
    let ringNow = paramsRef.current.ring;
    let spinNow = paramsRef.current.spin;
    let intensityNow = IDLE_INTENSITY;
    let levelNow = 0;
    let time = 0;
    let spinPhase = 0;
    let last = performance.now();
    let lastColor = 0;

    const frame = (now: number) => {
      if (lost || !gl || !program) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (now - lastColor > 800) {
        readColors();
        lastColor = now;
      }

      const p = paramsRef.current;
      const k = Math.min(1, dt * 2.0);
      symNow += (p.sym - symNow) * k;
      ringNow += (p.ring - ringNow) * k;
      spinNow += (p.spin - spinNow) * k;
      intensityNow += ((p.isPlaying ? 1 : IDLE_INTENSITY) - intensityNow) * k;
      const lvl = getAudioLevel();
      levelNow += (lvl - levelNow) * Math.min(1, dt * 6);

      // Freeze all motion (wave flow + rotation) while not playing.
      if (p.isPlaying) {
        time += dt;
        spinPhase += spinNow * dt;
      }

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
      gl.uniform1f(uniforms.u_seed, p.seed);
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
      // NOTE: do not force-loseContext() here (StrictMode double-mount safety).
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ backgroundColor: "#040711", ...style }}
    />
  );
}
