"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSynthStore } from "@/store/useSynthStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import CustomProgramCard from "@/components/CustomProgramCard";
import PublishedProgramCard from "@/components/PublishedProgramCard";
import SynthPresetCard from "@/components/SynthPresetCard";
import { Plus } from "lucide-react";

/**
 * 管理パネル「音源」タブ — 音源の制作と配信。
 *
 * もとは Sync Session に並べていた管理者専用ブロック（カスタムプログラム／
 * 合成器の新規作成・プリセット／公開・取り下げ）をここへ移した。Sync Session
 * は利用者が聴くための画面で、管理者にとっても再生面。作る・配信するの操作は
 * 管理パネルに集約する。
 *
 * 流れは 上から順に「作る → 手元のカスタム → 配信中」。グループへの割り当ては
 * 隣の「配信」タブ（ProgramAssigner）。
 */
export default function AudioStudio() {
  const router = useRouter();
  const savedPresets = useSynthStore((s) => s.savedPresets);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);
  const resetEditor = useSynthStore((s) => s.resetEditor);
  const setTimelineMode = useSynthStore((s) => s.setTimelineMode);
  const publishedPrograms = usePublishedProgramsStore((s) => s.programs);
  const fetchPrograms = usePublishedProgramsStore((s) => s.fetchPrograms);

  // 他ページのような hydrated ガードは要らない：管理パネルは authLoading /
  // roleLoaded が解けるまで「読み込み中」を返すので、このタブが載るのは
  // 初回ハイドレーションが終わったあと。persist の値を直接読んでよい。
  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const handleNewSynth = () => {
    resetEditor();
    router.push("/synth");
  };

  const handleNewTimeline = () => {
    resetEditor();
    setTimelineMode(true); // seeds segment 0 from the (reset) editor buffer
    router.push("/synth");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 作る — 合成器エディタ（/synth）への入口 */}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">新しい音源をつくる</p>
        <div className="flex gap-2">
          <button
            onClick={handleNewSynth}
            className="flex-1 min-h-12 rounded-2xl bg-navy text-text-secondary text-sm font-medium neu-raised-sm neu-press transition-transform flex items-center justify-center gap-2"
          >
            <Plus size={18} strokeWidth={2} />
            新規作成
          </button>
          <button
            onClick={handleNewTimeline}
            className="flex-1 min-h-12 rounded-2xl bg-navy text-text-secondary text-sm font-medium neu-raised-sm neu-press transition-transform flex items-center justify-center gap-2"
          >
            <Plus size={18} strokeWidth={2} />
            タイムライン
          </button>
        </div>
      </div>

      {/* カスタムプログラム — 再生・編集・削除と、ここからの公開 */}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">カスタムプログラム</p>
        {savedPrograms.length > 0 ? (
          savedPrograms.map((program) => (
            <CustomProgramCard key={program.id} program={program} />
          ))
        ) : (
          <p className="text-sm text-text-muted">
            まだありません。「新規作成」から音源をつくって保存すると、ここに並びます。
          </p>
        )}
      </div>

      {/* シンセプリセット — 合成器の音づくりの保存分 */}
      {savedPresets.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">シンセプリセット</p>
          {savedPresets.map((preset) => (
            <SynthPresetCard key={preset.id} preset={preset} />
          ))}
        </div>
      )}

      {/* 配信中 — 取り下げはこの画面だけ（manage） */}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">配信中のプログラム</p>
        {publishedPrograms.length > 0 ? (
          <>
            {publishedPrograms.map((program) => (
              <PublishedProgramCard key={program.id} program={program} manage />
            ))}
            <p className="text-xs text-text-muted">
              どのグループに配信するかは「配信」タブで割り当てます。
            </p>
          </>
        ) : (
          <p className="text-sm text-text-muted">
            まだありません。カスタムプログラムの公開ボタン（↑）で配信できます。
          </p>
        )}
      </div>
    </div>
  );
}
