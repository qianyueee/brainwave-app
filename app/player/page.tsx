"use client";

import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { getProgramById, isCustomProgramId } from "@/lib/programs";
import Visualizer from "@/components/Visualizer";
import PlaybackControls from "@/components/PlaybackControls";
import Timer from "@/components/Timer";
import Mixer from "@/components/Mixer";

export default function PlayerPage() {
  const programId = useAppStore((s) => s.selectedProgramId);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);

  const isCustom = isCustomProgramId(programId);
  const program = isCustom ? undefined : getProgramById(programId);
  const customProgram = isCustom ? savedPrograms.find((p) => p.id === programId) : undefined;

  const displayName = isCustom ? customProgram?.name : program?.name;
  const displayDesc = isCustom ? customProgram?.description : program?.description;

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

      <div className="bg-navy-light rounded-2xl p-4 flex flex-col gap-4">
        <Timer />
        <Mixer />
      </div>
    </div>
  );
}
