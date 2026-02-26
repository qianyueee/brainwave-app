"use client";

import { InputHTMLAttributes, useMemo } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export default function RangeSlider({ className = "", style, ...props }: Props) {
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 100);
  const val = Number(props.value ?? min);
  const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;

  const trackStyle = useMemo(
    () => ({
      ...style,
      background: `linear-gradient(to right, var(--dyn-primary) ${pct}%, var(--dyn-navy-lighter) ${pct}%)`,
    }),
    [style, pct],
  );

  return (
    <input
      type="range"
      className={`range-fill ${className}`}
      style={trackStyle}
      {...props}
    />
  );
}
