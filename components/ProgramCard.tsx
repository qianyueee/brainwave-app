"use client";

import { useRouter } from "next/navigation";
import { ProgramConfig } from "@/lib/programs";
import { getAdjustedProgram } from "@/lib/brain-profile";
import { useAppStore } from "@/store/useAppStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { Waves, Zap, Moon, ChevronRight } from "lucide-react";

const PROGRAM_ICONS: Record<string, typeof Waves> = {
  "reset-deep": Waves,
  "clarity-focus": Zap,
  "night-recovery": Moon,
};

interface ProgramCardProps {
  program: ProgramConfig;
}

export default function ProgramCard({ program }: ProgramCardProps) {
  const router = useRouter();
  const setSelectedProgramId = useAppStore((s) => s.setSelectedProgramId);
  const setTimerDuration = useAppStore((s) => s.setTimerDuration);
  const profile = useBrainProfileStore((s) => s.profile);

  const adjusted = getAdjustedProgram(program.id, profile?.indicators ?? null);
  const isPersonalized = adjusted && adjusted.defaultDuration !== program.defaultDuration;

  const handleClick = () => {
    setSelectedProgramId(program.id);
    setTimerDuration(adjusted?.defaultDuration ?? program.defaultDuration);
    router.push("/player");
  };

  const displayMinutes = Math.round((adjusted?.defaultDuration ?? program.defaultDuration) / 60);
  const Icon = PROGRAM_ICONS[program.id] ?? Waves;

  return (
    <button
      onClick={handleClick}
      className="w-full bg-navy rounded-3xl p-4 flex items-center gap-4 text-left neu-raised neu-press transition-transform"
    >
      <div className="w-14 h-14 rounded-2xl bg-navy neu-inset flex items-center justify-center shrink-0">
        <Icon size={26} className="text-primary" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-base font-bold text-text-primary">{program.name}</p>
          {isPersonalized && (
            <span className="text-[10px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              パーソナライズ済み
            </span>
          )}
        </div>
        <p className="text-sm text-text-secondary mt-0.5">
          {program.description}
        </p>
        <p className="text-xs text-text-muted mt-1">
          {adjusted?.carrierFreq ?? program.carrierFreq}Hz・{displayMinutes}分
        </p>
      </div>
      <ChevronRight size={20} className="text-text-muted shrink-0" />
    </button>
  );
}
