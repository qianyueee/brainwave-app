"use client";

import { useRouter } from "next/navigation";
import type { CustomProgram } from "@/lib/programs";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";

interface CustomProgramCardProps {
  program: CustomProgram;
}

export default function CustomProgramCard({ program }: CustomProgramCardProps) {
  const router = useRouter();
  const setSelectedProgramId = useAppStore((s) => s.setSelectedProgramId);
  const setTimerDuration = useAppStore((s) => s.setTimerDuration);
  const loadProgramForEdit = useSynthStore((s) => s.loadProgramForEdit);
  const deleteProgram = useSynthStore((s) => s.deleteProgram);

  const handleClick = () => {
    setSelectedProgramId(program.id);
    setTimerDuration(program.defaultDuration);
    router.push("/player");
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    loadProgramForEdit(program);
    router.push("/synth");
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteProgram(program.id);
  };

  const displayMinutes = Math.round(program.defaultDuration / 60);

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
          <p className="text-base font-bold text-text-primary truncate">{program.name}</p>
          <span className="text-[10px] font-bold text-accent bg-accent/15 px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0">
            カスタム
          </span>
        </div>
        <p className="text-sm text-text-secondary mt-0.5">
          {program.description}
        </p>
        <p className="text-xs text-text-muted mt-1">{displayMinutes}分</p>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          onClick={handleEdit}
          className="w-9 h-9 rounded-lg bg-navy-lighter flex items-center justify-center text-text-secondary active:scale-95"
          aria-label="編集"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
          </svg>
        </button>
        <button
          onClick={handleDelete}
          className="w-9 h-9 rounded-lg bg-navy-lighter flex items-center justify-center text-red-400 active:scale-95"
          aria-label="削除"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" />
          </svg>
        </button>
      </div>
    </button>
  );
}
