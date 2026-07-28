"use client";

import { ZODIAC_SIGNS, type ZodiacKey } from "@/lib/zodiac";
import ZodiacConstellation from "@/components/ZodiacConstellation";

interface ZodiacSignPickerProps {
  /** Highlighted sign (the card passes the effective sign, settings the stored one). */
  value: ZodiacKey | null;
  onChange: (key: ZodiacKey) => void;
  disabled?: boolean;
}

/**
 * Always-visible 4×3 grid — every sign is one tap away (the spec's ワンタップ
 * 切替), styled like the Timer preset buttons.
 */
export default function ZodiacSignPicker({ value, onChange, disabled }: ZodiacSignPickerProps) {
  return (
    <div role="group" aria-label="星座を選択" className="grid grid-cols-4 gap-2">
      {ZODIAC_SIGNS.map((sign) => {
        const isSelected = sign.key === value;
        return (
          <button
            key={sign.key}
            onClick={() => onChange(sign.key)}
            disabled={disabled}
            aria-pressed={isSelected}
            className={`min-h-14 py-2 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
              isSelected
                ? "bg-navy-light text-primary neu-inset"
                : "bg-navy text-text-secondary neu-raised-sm neu-press"
            }`}
          >
            <ZodiacConstellation sign={sign.key} variant="icon" className="w-8 h-8" />
            <span className="text-sm leading-tight">{sign.nameJa}</span>
          </button>
        );
      })}
    </div>
  );
}
