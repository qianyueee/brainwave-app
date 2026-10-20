"use client";

import type { ReactNode } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { AnalysisErrorCode } from "@/lib/brain-analysis";
import { intlLocale, useLocale, useT, type Locale, type LocalizedText } from "@/lib/i18n";
import type { AiEntry } from "@/store/useBrainAnalysisStore";

/** 失敗の言い方（1件の分析・比較分析で共通。カードごとに差し替えられる）。 */
export const AI_ERROR_TEXT: Record<AnalysisErrorCode, LocalizedText> = {
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
  unreachable: {
    ja: "AIの窓口から応答がありませんでした。時間をおいてお試しください。",
    en: "The AI service didn't respond. Please try again later.",
  },
};

/** 本文の1節（見出し＋中身）。 */
export function AiSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-bold text-primary mb-1">{title}</h4>
      {children}
    </div>
  );
}

export function AiList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 flex flex-col gap-1 text-base text-text-primary">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

/** 保存された分析のうち、カードが自分で読む項目。 */
interface SavedResult {
  /** 分析を書いた言語。 */
  locale: Locale;
  /** 作成日時（ISO）。 */
  createdAt: string;
}

/**
 * 「AIによる分析」のカード（1件の分析＝BrainAiAnalysis・比較分析＝BrainAiCompare が
 * 中身を渡して使う）。読み込み中 → 分析前の説明とボタン／分析中／本文、失敗の一言、
 * 作成日時と「医療的な診断ではありません」まで、どちらも同じ形で出す。
 */
export default function AiAnalysisCard<T extends SavedResult>({
  titleId,
  title,
  intro,
  runLabel,
  entry,
  renderBody,
  errorText,
  onRun,
  onReload,
}: {
  /** 見出しの id（aria-labelledby。同じ画面にほかのカードがあっても重ならない値）。 */
  titleId: string;
  title: string;
  /** まだ分析していないときの説明——何を送り、何を送らないか。 */
  intro: string;
  /** 最初のボタン（「AIで分析する」など）。 */
  runLabel: string;
  entry: AiEntry<T>;
  renderBody: (result: T) => ReactNode;
  /** 失敗の言い方の差し替え（code ごと）。 */
  errorText?: Partial<Record<AnalysisErrorCode, LocalizedText>>;
  onRun: () => void;
  onReload: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const { result, busy, error } = entry;
  const analyzing = busy === "analyzing";
  const firstLoad = busy === "loading" && !entry.loaded;

  const createdAt = result?.createdAt
    ? new Date(result.createdAt).toLocaleString(intlLocale(locale), {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={analyzing || firstLoad}
      className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col gap-4"
    >
      <div className="flex items-center justify-center gap-2">
        <Sparkles size={18} strokeWidth={1.75} className="text-primary" />
        <h3 id={titleId} className="text-base font-bold text-text-primary">
          {title}
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
      ) : result ? (
        <>
          {/* 言語は2つだけなので、食い違い＝もう一方の言語で書かれている。 */}
          {result.locale !== locale && (
            <p className="text-sm text-text-secondary bg-navy rounded-xl px-3 py-2">
              {t(
                "この分析は英語で作成されました。もう一度分析すると日本語になります。",
                "This analysis was written in Japanese. Analyze again to get it in English."
              )}
            </p>
          )}
          {renderBody(result)}
        </>
      ) : (
        <p className="text-sm text-text-secondary text-center">{intro}</p>
      )}

      {error && !analyzing && (
        <p role="alert" className="text-sm text-warning text-center">
          {error.phase === "load"
            ? t("保存した分析を読み込めませんでした。", "Couldn't load the saved analysis.")
            : t(errorText?.[error.code] ?? AI_ERROR_TEXT[error.code])}
        </p>
      )}

      {!firstLoad && !analyzing && (
        <>
          {error?.phase === "load" ? (
            <button
              onClick={onReload}
              className="w-full min-h-12 rounded-2xl bg-navy text-text-primary text-base font-bold flex items-center justify-center gap-2 neu-raised-sm neu-press transition-transform"
            >
              <RefreshCw size={18} />
              {t("もう一度読み込む", "Try loading again")}
            </button>
          ) : result ? (
            <button
              onClick={onRun}
              className="w-full min-h-12 rounded-2xl bg-navy text-text-primary text-base font-bold flex items-center justify-center gap-2 neu-raised-sm neu-press transition-transform"
            >
              <RefreshCw size={18} />
              {t("もう一度分析する", "Analyze again")}
            </button>
          ) : (
            <button
              onClick={onRun}
              className="w-full min-h-12 rounded-2xl bg-primary text-on-primary text-base font-bold flex items-center justify-center gap-2 neu-raised neu-press transition-transform"
            >
              <Sparkles size={18} />
              {error ? t("もう一度試す", "Try again") : runLabel}
            </button>
          )}
        </>
      )}

      {result && !analyzing && (
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
