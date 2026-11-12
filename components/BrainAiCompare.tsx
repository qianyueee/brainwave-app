"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { BrainProfile } from "@/lib/brain-profile";
import {
  COMPARISON_MIN,
  buildComparisonInput,
  comparisonBeforeAfter,
  comparisonKeys,
  type BeforeAfterPair,
  type BrainComparisonContent,
} from "@/lib/brain-analysis";
import { measurementLabel } from "@/lib/brain-measurements";
import { mainProgramLabel } from "@/lib/mind/playback-label";
import { useLocale, useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import {
  EMPTY_AI_ENTRY,
  comparisonKey,
  useBrainAnalysisStore,
} from "@/store/useBrainAnalysisStore";
import AiAnalysisCard, { AiList, AiSection } from "@/components/AiAnalysisCard";

/**
 * 「施術前 11月12日 10:00 → 施術後 11月12日 10:30・♪リセット＆ディープ」——AI が施術前と
 * 施術後として比べた組（保存された pairs）。どの測定がどちらかを本文の前に示す。
 */
function PairCaption({ pairs, measurements }: { pairs: BeforeAfterPair[]; measurements: BrainProfile[] }) {
  const t = useT();
  const locale = useLocale();
  const lines = pairs.flatMap((p) => {
    const before = measurements.find((m) => m.uploadedAt === p.before);
    const after = measurements.find((m) => m.uploadedAt === p.after);
    if (!before || !after) return [];
    const program = mainProgramLabel(after.playback, locale);
    const b = measurementLabel(before, locale);
    const a = measurementLabel(after, locale);
    return [
      t(
        `施術前 ${b} → 施術後 ${a}${program ? `・${program}` : ""}`,
        `Before: ${b} → After: ${a}${program ? ` · ${program}` : ""}`
      ),
    ];
  });
  if (lines.length === 0) return null;
  return (
    <div className="mb-2 flex flex-col gap-0.5">
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-text-secondary">
          {line}
        </p>
      ))}
    </div>
  );
}

function ComparisonBody({
  content,
  samePerson,
  measurements,
  expectBeforeAfter,
}: {
  content: BrainComparisonContent;
  samePerson: boolean;
  measurements: BrainProfile[];
  /** 選んだ測定に施術前と施術後の組がある（いまのアプリの決まりで）。 */
  expectBeforeAfter: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      {/* 施術前後の節より前に作った分析（または関数が施術前後を知らないとき）。 */}
      {expectBeforeAfter && content.beforeAfter.length === 0 && (
        <p className="text-sm text-text-secondary bg-navy rounded-xl px-3 py-2">
          {t(
            "もう一度分析すると、施術前と施術後の比較も入ります。",
            "Analyze again to add the before-and-after comparison."
          )}
        </p>
      )}
      <AiSection title={t("総評", "Overview")}>
        <p className="text-base text-text-primary">{content.summary}</p>
      </AiSection>
      {content.beforeAfter.length > 0 && (
        // プログラムを流さずに測った回（施術前）→ 流しながら測った回（施術後）。
        // 組は関数が決めて保存したもの（lib/before-after.ts と同じ決まり）。
        <AiSection title={t("施術前と施術後", "Before and after the session")}>
          <PairCaption pairs={content.pairs} measurements={measurements} />
          <AiList items={content.beforeAfter} />
        </AiSection>
      )}
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
 * 名前は送らない。測定中にプレーヤーにプログラムが入っていた秒も送り、プログラムを
 * 流さずに測った回（施術前）と流しながら測った回（施術後）があれば、AI がその変化を
 * 「施術前と施術後」にまとめる（lib/before-after.ts）。
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
  // プログラムを流さずに測った回と、流しながら測った回が両方あるか（同じ人で、施術前が先）。
  const expectBeforeAfter = comparisonBeforeAfter(measurements).length > 0;

  return (
    <AiAnalysisCard
      titleId="ai-compare-title"
      title={t("AIによる比較分析", "AI comparison")}
      intro={
        t(
          "選んだ測定の数値をAI（DeepSeek）が見比べて、違いを分かりやすい言葉でまとめます。メモや名前は送りません。",
          "The AI (DeepSeek) compares the numbers of the chosen measurements and sums up the differences in plain words. Your notes and names are not sent."
        ) +
        (expectBeforeAfter
          ? t(
              "プログラムを流さずに測った回を「施術前」、流しながら（一時停止中も含む）測った回を「施術後」として、その変化もまとめます。",
              " A measurement taken without a program counts as \"before the session\" and one taken with a program playing (or paused) as \"after\", and that change is summed up too."
            )
          : "")
      }
      runLabel={t("AIで比較分析する", "Compare with AI")}
      entry={entry}
      renderBody={(comparison) => (
        <ComparisonBody
          content={comparison.content}
          samePerson={samePerson}
          measurements={measurements}
          expectBeforeAfter={expectBeforeAfter}
        />
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
