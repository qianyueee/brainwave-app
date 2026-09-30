"use client";

import { useEffect } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { BrainProfile } from "@/lib/brain-profile";
import {
  buildAnalysisInput,
  type AnalysisErrorCode,
  type BrainAnalysisContent,
} from "@/lib/brain-analysis";
import { intlLocale, useLocale, useT, type LocalizedText } from "@/lib/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import {
  EMPTY_ANALYSIS_ENTRY,
  analysisKey,
  useBrainAnalysisStore,
} from "@/store/useBrainAnalysisStore";

const ERROR_TEXT: Record<AnalysisErrorCode, LocalizedText> = {
  not_configured: {
    ja: "AI分析はまだ準備中です。",
    en: "AI analysis isn't available yet.",
  },
  unauthorized: {
    ja: "ログインの有効期限が切れました。ログインし直してからお試しください。",
    en: "Your login has expired. Please log in again and try once more.",
  },
  bad_input: {
    ja: "アプリが古い可能性があります。最新の版に更新してからお試しください。",
    en: "Your app may be out of date. Please update it and try again.",
  },
  not_saved: {
    ja: "この測定はまだアカウントに保存されていません。少し待ってからお試しください。",
    en: "This measurement isn't saved to your account yet. Please wait a moment and try again.",
  },
  rate_limited: {
    ja: "分析の回数が多くなっています。しばらく時間をおいてからお試しください。",
    en: "You've analyzed a lot in a short time. Please wait a little and try again.",
  },
  upstream: {
    ja: "AIから答えを受け取れませんでした。もう一度お試しください。",
    en: "We couldn't get an answer from the AI. Please try again.",
  },
  network: {
    ja: "通信できませんでした。インターネットの接続を確かめてください。",
    en: "We couldn't connect. Please check your internet connection.",
  },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-bold text-primary mb-1">{title}</h4>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 flex flex-col gap-1 text-base text-text-primary">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

function AnalysisBody({ content }: { content: BrainAnalysisContent }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <Section title={t("総評", "Overview")}>
        <p className="text-base text-text-primary">{content.summary}</p>
      </Section>
      {content.strengths.length > 0 && (
        <Section title={t("良いところ", "What went well")}>
          <List items={content.strengths} />
        </Section>
      )}
      {content.cautions.length > 0 && (
        <Section title={t("気をつけたい点", "Things to watch")}>
          <List items={content.cautions} />
        </Section>
      )}
      {content.course && (
        <Section title={t("測定中の変化", "During the measurement")}>
          <p className="text-base text-text-primary">{content.course}</p>
        </Section>
      )}
      {content.suggestions.length > 0 && (
        <Section title={t("おすすめ", "Suggestions")}>
          <List items={content.suggestions} />
        </Section>
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
 */
export default function BrainAiAnalysis({ measurement }: { measurement: BrainProfile }) {
  const t = useT();
  const locale = useLocale();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;
  const uploadedAt = measurement.uploadedAt;
  const entry = useBrainAnalysisStore((s) =>
    userId ? s.byKey[analysisKey(userId, uploadedAt)] ?? EMPTY_ANALYSIS_ENTRY : EMPTY_ANALYSIS_ENTRY
  );
  const load = useBrainAnalysisStore((s) => s.load);
  const analyze = useBrainAnalysisStore((s) => s.analyze);

  useEffect(() => {
    if (supabase && userId) void load(userId, uploadedAt);
  }, [userId, uploadedAt, load]);

  // Supabase が無いビルド・ログアウト中は出さない（レポート自体がログイン前提）。
  if (!supabase || !userId) return null;

  const run = () => void analyze(userId, buildAnalysisInput(measurement, locale));
  const { analysis, busy, error } = entry;
  const analyzing = busy === "analyzing";
  const firstLoad = busy === "loading" && !entry.loaded;

  const createdAt = analysis?.createdAt
    ? new Date(analysis.createdAt).toLocaleString(intlLocale(locale), {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <section
      aria-labelledby="ai-analysis-title"
      aria-busy={analyzing || firstLoad}
      className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col gap-4"
    >
      <div className="flex items-center justify-center gap-2">
        <Sparkles size={18} strokeWidth={1.75} className="text-primary" />
        <h3 id="ai-analysis-title" className="text-base font-bold text-text-primary">
          {t("AIによる分析", "AI analysis")}
        </h3>
      </div>

      {firstLoad ? (
        <p className="text-sm text-text-muted text-center py-2">{t("読み込み中…", "Loading…")}</p>
      ) : analyzing ? (
        <div className="flex flex-col items-center gap-2 py-4" role="status">
          <Loader2 size={28} className="text-primary animate-spin" />
          <p className="text-base text-text-primary">{t("分析中…", "Analyzing…")}</p>
          <p className="text-xs text-text-muted">
            {t("30秒ほどかかることがあります", "This can take about 30 seconds")}
          </p>
        </div>
      ) : analysis ? (
        <>
          {/* 言語は2つだけなので、食い違い＝もう一方の言語で書かれている。 */}
          {analysis.locale !== locale && (
            <p className="text-sm text-text-secondary bg-navy rounded-xl px-3 py-2">
              {t(
                "この分析は英語で作成されました。もう一度分析すると日本語になります。",
                "This analysis was written in Japanese. Analyze again to get it in English."
              )}
            </p>
          )}
          <AnalysisBody content={analysis.content} />
        </>
      ) : (
        <p className="text-sm text-text-secondary text-center">
          {t(
            "この測定の数値をAI（DeepSeek）が読み解き、分かりやすい言葉でまとめます。メモや名前は送りません。",
            "The AI (DeepSeek) reads this measurement's numbers and sums them up in plain words. Your notes and name are not sent."
          )}
        </p>
      )}

      {error && !analyzing && (
        <p role="alert" className="text-sm text-warning text-center">
          {error.phase === "load"
            ? t("保存した分析を読み込めませんでした。", "Couldn't load the saved analysis.")
            : t(ERROR_TEXT[error.code])}
        </p>
      )}

      {!firstLoad && !analyzing && (
        <>
          {error?.phase === "load" ? (
            <button
              onClick={() => void load(userId, uploadedAt)}
              className="w-full min-h-12 rounded-2xl bg-navy text-text-primary text-base font-bold flex items-center justify-center gap-2 neu-raised-sm neu-press transition-transform"
            >
              <RefreshCw size={18} />
              {t("もう一度読み込む", "Try loading again")}
            </button>
          ) : analysis ? (
            <button
              onClick={run}
              className="w-full min-h-12 rounded-2xl bg-navy text-text-primary text-base font-bold flex items-center justify-center gap-2 neu-raised-sm neu-press transition-transform"
            >
              <RefreshCw size={18} />
              {t("もう一度分析する", "Analyze again")}
            </button>
          ) : (
            <button
              onClick={run}
              className="w-full min-h-12 rounded-2xl bg-primary text-on-primary text-base font-bold flex items-center justify-center gap-2 neu-raised neu-press transition-transform"
            >
              <Sparkles size={18} />
              {error ? t("もう一度試す", "Try again") : t("AIで分析する", "Analyze with AI")}
            </button>
          )}
        </>
      )}

      {analysis && !analyzing && (
        <p className="text-xs text-text-muted text-center">
          {createdAt && (
            <>
              {t(`${createdAt} 作成`, `Written ${createdAt}`)}
              <br />
            </>
          )}
          {t(
            "AI（DeepSeek）による参考コメントです。医療的な診断ではありません。",
            "A reference comment by AI (DeepSeek), not a medical diagnosis."
          )}
        </p>
      )}
    </section>
  );
}
