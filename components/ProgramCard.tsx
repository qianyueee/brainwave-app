"use client";

import { ProgramConfig } from "@/lib/programs";
import { getAdjustedProgram } from "@/lib/brain-profile";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { usePlayProgram } from "@/components/usePlayProgram";
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
  const playProgram = usePlayProgram();
  const profile = useBrainProfileStore((s) => s.profile);

  const adjusted = getAdjustedProgram(program.id, profile?.indicators ?? null);
  const isPersonalized = adjusted && adjusted.defaultDuration !== program.defaultDuration;

  const handleClick = () => playProgram(program);

  const displayMinutes = Math.round((adjusted?.defaultDuration ?? program.defaultDuration) / 60);
  const Icon = PROGRAM_ICONS[program.id] ?? Waves;

  return (
    <button
      onClick={handleClick}
      className="w-full bg-surface border border-surface-border rounded-3xl p-4 flex items-center gap-4 text-left neu-raised neu-press transition-transform breathe"
    >
      <div className="w-14 h-14 rounded-2xl bg-navy neu-inset flex items-center justify-center shrink-0">
        <Icon size={26} className="text-primary" strokeWidth={1.5} />
      </div>
      {/* 名前と「周波数・長さ」の2行だけ。説明文は落とした——3節目とも名前で
          何のための音かが分かり、選ぶときに要るのは長さと周波数のほう。1枚が
          薄くなったぶん、3節目＋配信ぶんが折り返さず一望できる（説明は
          プレイヤー側に残る）。 */}
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-text-primary truncate">{program.name}</p>
        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
          <p className="text-xs text-text-muted">
            {adjusted?.carrierFreq ?? program.carrierFreq}Hz・{displayMinutes}分
          </p>
          {isPersonalized && (
            <span className="text-xs font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              パーソナライズ済み
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={20} className="text-text-muted shrink-0" />
    </button>
  );
}
