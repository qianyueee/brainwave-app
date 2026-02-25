"use client";

import { useRouter } from "next/navigation";
import type { CustomProgram } from "@/lib/programs";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { Waves, Pencil, Trash2 } from "lucide-react";

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
  const Icon = Waves;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      className="w-full bg-navy rounded-3xl p-4 flex items-center gap-4 text-left neu-raised neu-press transition-transform cursor-pointer"
    >
      <div className="w-14 h-14 rounded-2xl bg-navy neu-inset flex items-center justify-center shrink-0">
        <Icon size={26} className="text-accent" strokeWidth={1.5} />
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
          className="w-9 h-9 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary active:scale-95"
          aria-label="編集"
        >
          <Pencil size={16} strokeWidth={1.5} />
        </button>
        <button
          onClick={handleDelete}
          className="w-9 h-9 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-red-400 active:scale-95"
          aria-label="削除"
        >
          <Trash2 size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
