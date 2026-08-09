"use client";

import type { CustomProgram } from "@/lib/programs";
import { useAdminStore } from "@/store/useAdminStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { usePlayProgram } from "@/components/usePlayProgram";
import { Waves, X } from "lucide-react";

interface PublishedProgramCardProps {
  program: CustomProgram;
}

export default function PublishedProgramCard({ program }: PublishedProgramCardProps) {
  const playProgram = usePlayProgram();
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const unpublishProgram = usePublishedProgramsStore((s) => s.unpublishProgram);
  const loading = usePublishedProgramsStore((s) => s.loading);

  const handleClick = () => playProgram(program);

  const handleUnpublish = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await unpublishProgram(program.id);
  };

  const displayMinutes = Math.round(program.defaultDuration / 60);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      className="w-full bg-surface border border-surface-border rounded-3xl p-4 flex items-center gap-4 text-left neu-raised neu-press transition-transform breathe cursor-pointer"
    >
      <div className="w-14 h-14 rounded-2xl bg-navy neu-inset flex items-center justify-center shrink-0">
        <Waves size={26} className="text-success" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-base font-bold text-text-primary truncate">{program.name}</p>
          <span className="text-xs font-bold text-success bg-success/15 px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0">
            公開済み
          </span>
        </div>
        <p className="text-sm text-text-secondary mt-0.5">
          {program.description}
        </p>
        <p className="text-xs text-text-muted mt-1">{displayMinutes}分</p>
      </div>
      {isAdmin && (
        <button
          onClick={handleUnpublish}
          disabled={loading}
          className="w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-danger active:scale-95 shrink-0 disabled:opacity-50"
          aria-label="取り下げ"
        >
          <X size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
