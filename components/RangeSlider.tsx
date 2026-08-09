"use client";

import { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Slider with a 48px touch box and a slim rounded 6px visual track.
 *
 * The track is drawn as a separate pointer-events-none bar BEHIND the input,
 * not as the input's background: painting via the inline `background:`
 * shorthand resets `background-clip`, which once flooded the whole 48px hit
 * box with the fill gradient (the "square fat slider" bug). A real element
 * also gives properly rounded pill ends, which background-clip cannot.
 */
export default function RangeSlider({ className = "", style, ...props }: Props) {
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 100);
  const val = Number(props.value ?? min);
  const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;

  return (
    <div className={`relative ${className}`} style={style}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-navy-lighter neu-toggle-track overflow-hidden"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <input type="range" className="range-fill relative block w-full" {...props} />
    </div>
  );
}
