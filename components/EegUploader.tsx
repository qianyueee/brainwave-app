"use client";

import { useRef, useState } from "react";
import { parseEegFile, computeIndicators } from "@/lib/brain-profile";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";

export default function EegUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const setProfile = useBrainProfileStore((s) => s.setProfile);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setIsProcessing(true);
    try {
      const { rows, tag } = await parseEegFile(file);
      const indicators = computeIndicators(rows);
      setProfile({
        indicators,
        uploadedAt: new Date().toISOString(),
        sessionTag: tag,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ファイルの読み込みに失敗しました");
    } finally {
      setIsProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleChange}
        className="hidden"
        id="eeg-upload"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isProcessing}
        className="w-full py-3 rounded-2xl bg-primary text-white text-base font-bold transition-colors active:bg-primary-dark disabled:opacity-50"
      >
        {isProcessing ? "解析中..." : "脳波データをアップロード"}
      </button>
      <p className="text-xs text-text-muted text-center">
        Excel (.xlsx) または CSV ファイルに対応
      </p>
      {error && (
        <p className="text-sm text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
