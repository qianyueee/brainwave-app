"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { BrainProfile } from "@/lib/brain-profile";
import {
  COMPARISON_MIN,
  buildComparisonInput,
  comparisonKeys,
  type BrainComparisonContent,
} from "@/lib/brain-analysis";
import { useLocale, useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import {
  EMPTY_AI_ENTRY,
  comparisonKey,
  useBrainAnalysisStore,
} from "@/store/useBrainAnalysisStore";
import AiAnalysisCard, { AiList, AiSection } from "@/components/AiAnalysisCard";

function ComparisonBody({
  content,
  samePerson,
}: {
  content: BrainComparisonContent;
  samePerson: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <AiSection title={t("総評", "Overview")}>
        <p className="text-base text-text-primary">{content.summary}</p>
      </AiSection>
      {content.differences.length > 0 && (
        <AiSection title={t("主な違い", "Main differences")}>
          <AiList items={content.differences} />
        </AiSection>
      )}
      {content.strengths.length > 0 && (
        // 同じ人なら古い測定から新しい測定への変化、別の人どうしなら横並びの比較
        // として AI に頼んでいる（analyze-brain の buildCompareMessages）。見出しも合わせる。
        <AiSection
          title={
            samePerson
              ? t("良くなった点", "What improved")
              : t("それぞれの良いところ", "What each did well")
          }
        >
          <AiList items={content.strengths} />
        </AiSection>
      )}
      {content.cautions.length > 0 && (
        <AiSection title={t("気をつけたい点", "Things to watch")}>
          <AiList items={content.cautions} />
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
 * Sync Report「測定の比較」の「AIによる比較分析」。選んだ 2〜3件の数値を DeepSeek に
 * 送って（Edge Function analyze-brain の比較分析）、違いを言葉にしてもらう。結果は
 * アカウントに組ごとに1件残る——同じ測定の組を選び直せば、別の端末でも同じものが出る。
 * どれか1件の測定を消すと、その組の分析も一緒に消える（migration 007）。
 *
 * 送るのは数値と日時だけ（lib/brain-analysis.ts の buildComparisonInput）。メモと
 * 名前は送らない。
 */
export default function BrainAiCompare({ measurements }: { measurements: BrainProfile[] }) {
  const t = useT();
  const locale = useLocale();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  // 古い順のキー。保存された分析の並び（uploaded_a / b / c）と同じ。
  const keys = comparisonKeys(measurements);
  const signature = keys.join("\u0000");
  const entry = useBrainAnalysisStore((s) =>
    userId ? s.comparisons[comparisonKey(userId, keys)] ?? EMPTY_AI_ENTRY : EMPTY_AI_ENTRY
  );
  const loadComparison = useBrainAnalysisStore((s) => s.loadComparison);
  const compare = useBrainAnalysisStore((s) => s.compare);

  useEffect(() => {
    const picked = signature.split("\u0000");
    if (supabase && userId && picked.length >= COMPARISON_MIN) void loadComparison(userId, picked);
  }, [userId, signature, loadComparison]);

  // Supabase が無いビルド・ログアウト中・1件しか選んでいないときは出さない。
  if (!supabase || !userId || keys.length < COMPARISON_MIN) return null;

  // 測定者の無い記録（アップロード・測定者より前の記録）は「名前の無い人」1人として
  // 数える——送る形の person と同じ数え方。
  const samePerson = new Set(measurements.map((m) => m.subject ?? "")).size === 1;

  return (
    <AiAnalysisCard
      titleId="ai-compare-title"
      title={t("AIによる比較分析", "AI comparison")}
      intro={t(
        "選んだ測定の数値をAI（DeepSeek）が見比べて、違いを分かりやすい言葉でまとめます。メモや名前は送りません。",
        "The AI (DeepSeek) compares the numbers of the chosen measurements and sums up the differences in plain words. Your notes and names are not sent."
      )}
      runLabel={t("AIで比較分析する", "Compare with AI")}
      entry={entry}
      renderBody={(comparison) => (
        <ComparisonBody content={comparison.content} samePerson={samePerson} />
      )}
      errorText={{
        not_configured: {
          ja: "AIによる比較分析はまだ準備中です。",
          en: "AI comparison isn't available yet.",
        },
        not_saved: {
          ja: "選んだ測定の中に、まだアカウントに保存されていないものがあります。少し待ってからお試しください。",
          en: "One of the chosen measurements isn't saved to your account yet. Please wait a moment and try again.",
        },
      }}
      onRun={() => void compare(userId, buildComparisonInput(measurements, locale))}
      onReload={() => void loadComparison(userId, keys)}
    />
  );
}
