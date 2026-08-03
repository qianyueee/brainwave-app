import type { CSSProperties } from "react";

interface WaterMandalaProps {
  /** Carrier frequency (Hz) — sets how many concentric rings the surface has. */
  carrier: number;
  /** Guided beat frequency (Hz) — sets how many petals the wreaths grow. */
  beat: number;
  animated?: boolean;
  className?: string;
}

const clamp = (min: number, max: number, v: number) => Math.max(min, Math.min(max, v));

/**
 * 水のマンダラ — a cymatic water figure drawn from the day's frequency pair.
 * The geometry is deterministic (SSR-safe): the carrier maps to the ring
 * count, the beat maps to the petal count (2Hz→6 petals … 40Hz→24, log
 * scale so every modular beat gets a distinct figure), and the ripple train
 * speeds up with the beat. All strokes inherit currentColor; the parent sets
 * the water tint. Ripples are deliberately staggered — a wave train, unlike
 * the constellation stars that breathe in unison.
 */
export default function WaterMandala({
  carrier,
  beat,
  animated = false,
  className = "",
}: WaterMandalaProps) {
  const rings = clamp(4, 8, Math.round(3 + carrier / 180));
  const petals = clamp(
    6,
    24,
    Math.round(6 + (18 * Math.log2(Math.max(beat, 2) / 2)) / Math.log2(20))
  );
  const innerPetals = Math.max(5, Math.round(petals * 0.6));
  // Faster water for faster beats: 40Hz ≈ 4s per ripple, 2Hz ≈ 8s.
  const rippleDur = clamp(4, 8, 8.4 - Math.log2(Math.max(beat, 2) / 2) * 1.02);

  const ringRadii = Array.from(
    { length: rings },
    (_, i) => 24 + (i * (90 - 24)) / (rings - 1)
  );

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label={`水のマンダラ（${carrier}Hz × ${beat}Hz）`}
    >
      {/* Still-water rings — density follows the carrier */}
      {ringRadii.map((r, i) => (
        <circle
          key={`ring-${i}`}
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          opacity={0.16 - i * 0.012}
        />
      ))}

      {/* Expanding ripple train — negative delays keep it mid-flight on load */}
      {[0, 1, 2].map((i) => (
        <circle
          key={`ripple-${i}`}
          cx="100"
          cy="100"
          r="34"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity={animated ? undefined : 0.18}
          className={animated ? "mandala-ripple" : ""}
          style={
            animated
              ? ({
                  "--ripple-dur": `${rippleDur}s`,
                  "--ripple-delay": `${(-i * rippleDur) / 3}s`,
                } as CSSProperties)
              : undefined
          }
        />
      ))}

      {/* Outer petal wreath — count follows the beat, drifts clockwise */}
      <g className={animated ? "mandala-spin" : ""} style={{ "--spin-dur": "90s" } as CSSProperties}>
        {Array.from({ length: petals }, (_, i) => {
          const a = (i * 360) / petals;
          return (
            <g key={`petal-${i}`} transform={`rotate(${a} 100 100)`}>
              <ellipse
                cx="100"
                cy="57"
                rx="9"
                ry="27"
                fill="currentColor"
                fillOpacity="0.045"
                stroke="currentColor"
                strokeWidth="0.7"
                opacity="0.5"
              />
              <circle cx="100" cy="30" r="1.5" fill="currentColor" opacity="0.75" />
            </g>
          );
        })}
      </g>

      {/* Inner wreath — half-step offset, drifts the other way */}
      <g
        className={animated ? "mandala-spin mandala-spin-rev" : ""}
        style={{ "--spin-dur": "130s" } as CSSProperties}
      >
        {Array.from({ length: innerPetals }, (_, i) => {
          const a = ((i + 0.5) * 360) / innerPetals;
          return (
            <ellipse
              key={`inner-${i}`}
              transform={`rotate(${a} 100 100)`}
              cx="100"
              cy="76"
              rx="6.5"
              ry="15"
              fill="currentColor"
              fillOpacity="0.06"
              stroke="currentColor"
              strokeWidth="0.6"
              opacity="0.4"
            />
          );
        })}
      </g>

      {/* Luminous core — same glow language as the constellation stars */}
      <circle
        cx="100"
        cy="100"
        r="13"
        fill="currentColor"
        opacity="0.12"
        className={animated ? "constellation-halo" : ""}
      />
      <circle cx="100" cy="100" r="6.5" fill="currentColor" opacity="0.45" />
      <circle cx="100" cy="100" r="3" fill="#fff" opacity="0.95" />
    </svg>
  );
}
