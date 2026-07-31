import type { ZodiacKey } from "@/lib/zodiac";
import { ZODIAC_KEYS } from "@/lib/zodiac";
import { CONSTELLATIONS } from "@/lib/zodiac-constellations";

interface ZodiacConstellationProps {
  sign: ZodiacKey;
  /**
   * hero: 晕光多层描画（大きく表示する用）。
   * icon: 小さいサイズ（〜40px）向けに太め・簡略描画。
   */
  variant?: "hero" | "icon";
  /** 星をゆっくり明滅させる（hero 向け。CSS アニメのみ、再レンダーなし）。 */
  animated?: boolean;
  className?: string;
}

/** Deterministic tiny PRNG (mulberry32) — background specks must be identical between SSR and client. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 点線＋晕光の星図風星座グラフィック（SVG、色は currentColor 継承）。
 * 発光はフィルタではなく重ね描き（ぼかしフィルタより軽く、静的書き出しでも安定）。
 */
export default function ZodiacConstellation({
  sign,
  variant = "hero",
  animated = false,
  className,
}: ZodiacConstellationProps) {
  const shape = CONSTELLATIONS[sign];
  const isIcon = variant === "icon";

  // Faint background specks (hero only) — seeded per sign so SSR HTML matches.
  const specks: [number, number, number][] = [];
  if (!isIcon) {
    const rand = mulberry32(ZODIAC_KEYS.indexOf(sign) + 1);
    for (let i = 0; i < 9; i++) {
      specks.push([8 + rand() * 84, 8 + rand() * 84, 0.5 + rand() * 0.6]);
    }
  }

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {specks.map(([x, y, r], i) => (
        <circle key={`s${i}`} cx={x} cy={y} r={r} fill="currentColor" opacity={0.16} />
      ))}

      {/* Lines: soft glow underlay + crisp core line (single pass for icons) */}
      {shape.lines.map(([a, b], i) => {
        const [x1, y1] = shape.stars[a];
        const [x2, y2] = shape.stars[b];
        return (
          <g key={`l${i}`}>
            {!isIcon && (
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                opacity={0.1}
              />
            )}
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="currentColor"
              strokeWidth={isIcon ? 2 : 0.7}
              strokeLinecap="round"
              opacity={isIcon ? 0.55 : 0.5}
            />
          </g>
        );
      })}

      {/* Stars: halo + mid glow + bright core; brightness scales the radii */}
      {shape.stars.map(([x, y, b], i) => {
        const star = isIcon ? (
          <g key={`p${i}`}>
            <circle cx={x} cy={y} r={4.4 * b} fill="currentColor" opacity={0.22} />
            <circle cx={x} cy={y} r={2.5 * b} fill="currentColor" opacity={0.95} />
          </g>
        ) : (
          <g key={`p${i}`} className={animated ? "constellation-star" : undefined}>
            <circle
              cx={x}
              cy={y}
              r={3.6 * b}
              fill="currentColor"
              opacity={0.14}
              className={animated ? "constellation-halo" : undefined}
            />
            <circle cx={x} cy={y} r={1.9 * b} fill="currentColor" opacity={0.34} />
            <circle cx={x} cy={y} r={1.0 * b} fill="currentColor" opacity={0.95} />
          </g>
        );
        return star;
      })}
    </svg>
  );
}
