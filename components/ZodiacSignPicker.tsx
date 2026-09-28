"use client";

import { ZODIAC_SIGNS, zodiacName, type ZodiacKey } from "@/lib/zodiac";
import { useLocale, useT } from "@/lib/i18n";
import ZodiacConstellation from "@/components/ZodiacConstellation";

interface ZodiacSignPickerProps {
  /** Highlighted sign (the card passes the effective sign, settings the stored one). */
  value: ZodiacKey | null;
  onChange: (key: ZodiacKey) => void;
  disabled?: boolean;
  /**
   * Render on the star-sky surface (Home's hero) instead of the page surface.
   * Sky tokens carry their own contrast direction, and the neumorphic shadows
   * are tuned for the page background — on the sky they read as smudges.
   */
  onSky?: boolean;
}

/**
 * English names too wide for a 4-column cell on a 360px phone (~58px at 14px:
 * Sagittarius ≈ 71px, Capricorn ≈ 64px, Aquarius ≈ 58px) get a soft hyphen at
 * a dictionary break point. The browser breaks there only when the name does
 * not fit ("Sagit-/tarius"), so wider screens still show the whole word.
 * Japanese names are 2–3 characters and never need this.
 */
const EN_BREAKABLE: Partial<Record<ZodiacKey, string>> = {
  sagittarius: "Sagit\u00adtarius",
  capricorn: "Capri\u00adcorn",
  aquarius: "Aquar\u00adius",
};

/**
 * Always-visible 4×3 grid — every sign is one tap away (the spec's ワンタップ
 * 切替), styled like the Timer preset buttons.
 */
export default function ZodiacSignPicker({
  value,
  onChange,
  disabled,
  onSky = false,
}: ZodiacSignPickerProps) {
  const t = useT();
  const locale = useLocale();
  return (
    <div role="group" aria-label={t("星座を選択", "Choose your sign")} className="grid grid-cols-4 gap-2">
      {ZODIAC_SIGNS.map((sign) => {
        const isSelected = sign.key === value;
        const name =
          locale === "en" ? (EN_BREAKABLE[sign.key] ?? zodiacName(sign, locale)) : sign.nameJa;
        return (
          <button
            key={sign.key}
            onClick={() => onChange(sign.key)}
            disabled={disabled}
            aria-pressed={isSelected}
            className={`min-h-14 py-2 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
              onSky
                ? isSelected
                  ? "bg-sky-chip text-sky-strong ring-1 ring-sky-line"
                  : "text-sky-text border border-sky-line active:scale-95"
                : isSelected
                  ? "bg-navy-light text-primary neu-inset"
                  : "bg-navy text-text-secondary neu-raised-sm neu-press"
            }`}
          >
            <ZodiacConstellation sign={sign.key} variant="icon" className="w-8 h-8" />
            <span className="text-sm leading-tight">{name}</span>
          </button>
        );
      })}
    </div>
  );
}
