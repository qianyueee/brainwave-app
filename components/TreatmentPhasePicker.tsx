"use client";

import { useId } from "react";
import { TREATMENT_PHASES, type TreatmentPhase } from "@/lib/before-after";
import { treatmentPhaseCaption, treatmentPhaseLabel } from "@/lib/treatment-phase-label";
import { useLocale, useT } from "@/lib/i18n";

/**
 * 施術のタイミング（施術前・施術中・施術後）を選ぶ3つのボタン。選ばなくてもよい
 * （任意）——選んでいるボタンをもう一度押すと外れる。
 *
 * 選んだタイミングは測定の記録に残り（treatmentPhase）、AI 比較分析が施術による変化を
 * まとめるときに、プレーヤーの状態から推し量るより先に使う（lib/before-after.ts）。
 * 置き場所は測り終えたダイアログ（脳波測定）・10秒チェックの結果・ヒストリーの記録カード。
 */
export default function TreatmentPhasePicker({
  value,
  onChange,
  disabled = false,
  hint,
}: {
  value: TreatmentPhase | undefined;
  onChange: (next: TreatmentPhase | undefined) => void;
  disabled?: boolean;
  /** ボタンの下に添える1行（無ければ出さない）。 */
  hint?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const captionId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <span id={captionId} className="text-sm text-text-secondary">
        {treatmentPhaseCaption(locale)}
        {t("（任意）", " (optional)")}
      </span>
      <div role="group" aria-labelledby={captionId} className="flex gap-2">
        {TREATMENT_PHASES.map((p) => {
          const selected = value === p;
          return (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => onChange(selected ? undefined : p)}
              aria-pressed={selected}
              className={`flex-1 min-w-0 min-h-12 px-2 rounded-xl text-base transition-all disabled:opacity-60 ${
                selected
                  ? "bg-navy-light text-primary font-bold neu-inset"
                  : "bg-navy text-text-primary font-medium neu-raised-sm neu-press"
              }`}
            >
              {treatmentPhaseLabel(p, locale, { short: true })}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
