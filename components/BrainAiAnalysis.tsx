"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { BrainProfile } from "@/lib/brain-profile";
import { buildAnalysisInput, type BrainAnalysisContent } from "@/lib/brain-analysis";
import { useLocale, useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import {
  EMPTY_AI_ENTRY,
  analysisKey,
  useBrainAnalysisStore,
} from "@/store/useBrainAnalysisStore";
import AiAnalysisCard, { AiList, AiSection } from "@/components/AiAnalysisCard";

function AnalysisBody({ content }: { content: BrainAnalysisContent }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <AiSection title={t("総評", "Overview")}>
        <p className="text-base text-text-primary">{content.summary}</p>
      </AiSection>
      {content.strengths.length > 0 && (
        <AiSection title={t("良いところ", "What went well")}>
          <AiList items={content.strengths} />
        </AiSection>
      )}
      {content.cautions.length > 0 && (
        <AiSection title={t("気をつけたい点", "Things to watch")}>
          <AiList items={content.cautions} />
        </AiSection>
      )}
      {content.course && (
        <AiSection title={t("測定中の変化", "During the measurement")}>
          <p className="text-base text-text-primary">{content.course}</p>
        </AiSection>
      )}
      {content.suggestions.length > 0 && (
        <AiSection title={t("おすすめ", "Suggestions")}>
          <AiList items={content.suggestions} />
        </AiSection>
      )}
    </div>
  );
}

/**
 * 大脳特性の下の「AIによる分析」。表示中の測定の数値を DeepSeek に送って
 * （Edge Function analyze-brain 経由）、返ってきた文章を載せる。結果はアカウントに
 * 1測定1件で残り、別の端末で開いても同じものが出る。
 *
 * 送るのは数値だけ（lib/brain-analysis.ts）。メモと名前は送らないことを、押す前の
 * 1行で伝える——健康に近いデータを外のサービスへ渡すので、黙って送らない。
 * カードの形（読み込み中・分析中・失敗・作成日時）は AiAnalysisCard。
 */
export default function BrainAiAnalysis({ measurement }: { measurement: BrainProfile }) {
  const t = useT();
  const locale = useLocale();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const uploadedAt = measurement.uploadedAt;
  const entry = useBrainAnalysisStore((s) =>
    userId ? s.byKey[analysisKey(userId, uploadedAt)] ?? EMPTY_AI_ENTRY : EMPTY_AI_ENTRY
  );
  const load = useBrainAnalysisStore((s) => s.load);
  const analyze = useBrainAnalysisStore((s) => s.analyze);

  useEffect(() => {
    if (supabase && userId) void load(userId, uploadedAt);
  }, [userId, uploadedAt, load]);

  // Supabase が無いビルド・ログアウト中は出さない（レポート自体がログイン前提）。
  if (!supabase || !userId) return null;

  return (
    <AiAnalysisCard
      titleId="ai-analysis-title"
      title={t("AIによる分析", "AI analysis")}
      intro={t(
        "この測定の数値をAI（DeepSeek）が読み解き、分かりやすい言葉でまとめます。メモや名前は送りません。",
        "The AI (DeepSeek) reads this measurement's numbers and sums them up in plain words. Your notes and name are not sent."
      )}
      runLabel={t("AIで分析する", "Analyze with AI")}
      entry={entry}
      renderBody={(analysis) => <AnalysisBody content={analysis.content} />}
      onRun={() => void analyze(userId, buildAnalysisInput(measurement, locale))}
      onReload={() => void load(userId, uploadedAt)}
    />
  );
}
