"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { Flame, CloudFog, Smile } from "lucide-react";

const MOODS = [
  { label: "イライラ", icon: Flame, programId: "reset-deep" },
  { label: "ぼんやり", icon: CloudFog, programId: "clarity-focus" },
  { label: "すっきり", icon: Smile, programId: "reset-deep" },
];

export default function MoodSelector() {
  const router = useRouter();
  const setMood = useAppStore((s) => s.setMood);
  const setSelectedProgramId = useAppStore((s) => s.setSelectedProgramId);

  const handleMood = (mood: (typeof MOODS)[number]) => {
    setMood(mood.label);
    setSelectedProgramId(mood.programId);
    router.push("/player");
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">今の気分は？</p>
      <div className="flex gap-3">
        {MOODS.map((mood) => {
          const Icon = mood.icon;
          return (
            <button
              key={mood.label}
              onClick={() => handleMood(mood)}
              className="flex-1 bg-surface border border-surface-border rounded-2xl py-4 flex flex-col items-center gap-2 neu-raised-sm neu-press transition-transform"
            >
              <span className="w-12 h-12 rounded-full bg-navy neu-inset flex items-center justify-center">
                <Icon size={24} className="text-primary" strokeWidth={1.5} />
              </span>
              <span className="text-sm text-text-primary">{mood.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
