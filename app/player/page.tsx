"use client";

import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { getProgramById, isCustomProgramId } from "@/lib/programs";
import Visualizer from "@/components/Visualizer";
import PlaybackControls from "@/components/PlaybackControls";
import Timer from "@/components/Timer";
import Mixer from "@/components/Mixer";
import ExportDialog from "@/components/ExportDialog";
import { Download } from "lucide-react";

export default function PlayerPage() {
  const programId = useAppStore((s) => s.selectedProgramId);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);
  const [exportOpen, setExportOpen] = useState(false);

  const isCustom = isCustomProgramId(programId);
  const program = isCustom ? undefined : getProgramById(programId);
  const customProgram = isCustom ? savedPrograms.find((p) => p.id === programId) : undefined;

  const displayName = isCustom ? customProgram?.name : program?.name;
  const displayDesc = isCustom ? customProgram?.description : program?.description;

  // Export only available for binaural programs (not custom synth programs)
  const canExport = !isCustom && !!program;

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Program name */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-text-primary">
          {displayName ?? "プログラムを選択"}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {displayDesc}
        </p>
      </div>

      <Visualizer />
      <PlaybackControls />

      <div className="bg-surface border border-surface-border rounded-3xl p-4 flex flex-col gap-4 neu-raised breathe" style={{ "--breathe-delay": "0.8s" } as React.CSSProperties}>
        <Timer />
        <Mixer />
      </div>

      {/* Export button */}
      {canExport && (
        <button
          onClick={() => setExportOpen(true)}
          className="w-full py-3 rounded-2xl bg-navy text-text-primary text-base font-bold flex items-center justify-center gap-2 neu-raised-sm neu-press transition-transform"
        >
          <Download size={20} strokeWidth={2} />
          音声をエクスポート
        </button>
      )}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} mode="binaural" />
    </div>
  );
}
