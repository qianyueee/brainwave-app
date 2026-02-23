"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";

const MOODS = [
  { label: "イライラ", emoji: "😤", programId: "reset-deep" },
  { label: "ぼんやり", emoji: "😶‍🌫️", programId: "clarity-focus" },
  { label: "すっきり", emoji: "😌", programId: "reset-deep" },
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
        {MOODS.map((mood) => (
          <button
            key={mood.label}
            onClick={() => handleMood(mood)}
            className="flex-1 bg-navy-light rounded-xl py-4 flex flex-col items-center gap-2 transition-colors active:bg-navy-lighter"
          >
            <span className="text-2xl">{mood.emoji}</span>
            <span className="text-sm text-text-primary">{mood.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
