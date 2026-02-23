"use client";

import { useRouter } from "next/navigation";
import { ProgramConfig } from "@/lib/programs";
import { getAdjustedProgram } from "@/lib/brain-profile";
import { useAppStore } from "@/store/useAppStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";

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

  return (
    <button
      onClick={handleClick}
      className="w-full bg-navy-light rounded-2xl p-4 flex items-center gap-4 text-left transition-colors active:bg-navy-lighter"
    >
      <div className="w-14 h-14 rounded-xl bg-navy-lighter flex items-center justify-center text-2xl shrink-0">
        {program.icon}
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
      <svg
        className="w-5 h-5 text-text-muted shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
