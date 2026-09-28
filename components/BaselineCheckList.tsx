"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Timer, Trash2 } from "lucide-react";
import {
  useAllBaselineChecks,
  useBaselineStore,
  type BaselineCheck,
} from "@/store/useBaselineStore";
import { BASELINE_MEASURE_SEC, rateMethodLabel } from "@/lib/mind/baseline";
import { scoreColor } from "@/lib/brain-measurements";
import { subjectDisplayName } from "@/lib/subject-groups";
import { intlLocale, useLocale, useT, type Locale } from "@/lib/i18n";

/** 最初に見せる件数。これ以上は「全 N 件を表示」で開く。 */
const PREVIEW_COUNT = 5;

function checkTime(c: BaselineCheck, locale: Locale): string {
  return new Date(c.recordedAt).toLocaleString(intlLocale(locale), {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CheckRow({ c, onDelete }: { c: BaselineCheck; onDelete: (id: string) => void }) {
  const t = useT();
  const locale = useLocale();
  const detail = [
    rateMethodLabel(c.method, locale),
    c.alphaRiseSec != null
      ? t(`α立ち上がり ${c.alphaRiseSec}秒`, `Alpha rise ${c.alphaRiseSec} sec`)
      : null,
    c.alphaRatio != null
      ? t(
          `閉眼／開眼のα比 ${c.alphaRatio.toFixed(2)}倍`,
          `Alpha ratio (eyes closed/open) ${c.alphaRatio.toFixed(2)}×`
        )
      : null,
    t(
      `有効データ ${c.usableSec}/${BASELINE_MEASURE_SEC}秒`,
      `Usable data ${c.usableSec}/${BASELINE_MEASURE_SEC} sec`
    ),
  ]
    .filter(Boolean)
    .join(t("・", " · "));

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 flex flex-col gap-2 neu-raised">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-text-primary">{checkTime(c, locale)}</p>
          <p className="text-xs text-text-muted">
            {[
              c.subjectName && subjectDisplayName(c.subjectName, locale),
              // デモで取った回は必ずそう見せる（実測と並ぶ場所なので）。
              c.source === "demo" ? t("デモデータ", "Demo data") : null,
            ]
              .filter(Boolean)
              .join(t("・", " · ")) || t("測定者の指定なし", "No person set")}
          </p>
        </div>
        <button
          onClick={() => {
            if (window.confirm(t("この10秒チェックの記録を削除しますか？", "Delete this 10-second check record?"))) {
              onDelete(c.id);
            }
          }}
          aria-label={t("この記録を削除", "Delete this record")}
          className="shrink-0 w-12 h-12 rounded-xl bg-navy neu-raised-sm neu-press flex items-center justify-center text-danger"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div className="rounded-2xl bg-navy neu-inset grid grid-cols-3 py-2">
        {(
          [
            { title: "Rate", score: c.rate },
            { title: "Clarity", score: c.clarity },
            { title: "Reset", score: c.reset },
          ] as const
        ).map((m, i) => (
          <div
            key={m.title}
            className={
              "flex flex-col items-center gap-0.5 px-1" +
              (i < 2 ? " border-r border-surface-border" : "")
            }
          >
            <span
              className="text-xl font-mono font-bold tabular-nums leading-tight"
              style={{
                color: m.score != null ? scoreColor(m.score) : "var(--dyn-text-muted)",
              }}
            >
              {m.score ?? "—"}
            </span>
            <span className="text-xs font-bold text-text-primary">{m.title}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-text-muted">{detail}</p>
    </div>
  );
}

/**
 * 10秒チェックの記録。
 *
 * 脳波測定（脳波の記録）と同じで、測ったものが後から見返せないと「毎日測る」
 * 意味が薄い。これまで保存した回はカレンダーの当日明細にしか出ておらず、
 * 日ごとの並びとして読むことができなかった。
 *
 * 脳波の記録と違ってログインを要求しない——このストアは素の localStorage に
 * 載っていて（習慣を止めないための設計）、未ログインでも記録が貯まるので、
 * 同じ画面でも認証ゲートの**外**に置く。ログイン中はアカウントに載っている
 * 記録（デスクトップ測定アプリで取った分を含む）も重ねて並べ、削除すると
 * アカウントからも消える。
 */
export default function BaselineCheckList() {
  const t = useT();
  // この端末の記録＋アカウントの記録（デスクトップ測定アプリで取った分も）。
  const checks = useAllBaselineChecks();
  const deleteCheck = useBaselineStore((s) => s.deleteCheck);

  // persist 由来なので初回描画では空。mount 後に出す（hydration mismatch 対策）。
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const [expanded, setExpanded] = useState(false);

  const ordered = hydrated ? [...checks].reverse() : [];
  const shown = expanded ? ordered : ordered.slice(0, PREVIEW_COUNT);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-bold text-text-primary">
          {t("10秒チェックの記録", "10-second check records")}
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          {t(
            "保存した10秒チェックの Rate・Clarity・Reset",
            "Rate, Clarity and Reset from your saved 10-second checks"
          )}
        </p>
      </div>

      {!hydrated ? null : ordered.length === 0 ? (
        <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised">
          <div className="flex justify-center mb-4">
            <Timer size={40} className="text-primary" strokeWidth={1.5} />
          </div>
          <p className="text-base font-bold text-text-primary mb-2">
            {t("まだ記録がありません", "No records yet")}
          </p>
          <p className="text-sm text-text-secondary mb-6">
            {t(
              "シンク・ブレインの「10秒チェック」で測って保存すると、ここに残ります。",
              "Take and save a “10-second check” on Sync Brain, and it will be kept here."
            )}
          </p>
          <Link
            href="/brain"
            className="inline-flex items-center justify-center min-h-12 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press"
          >
            {t("10秒チェックへ", "Go to 10-second check")}
          </Link>
        </div>
      ) : (
        <>
          {shown.map((c) => (
            <CheckRow key={c.id} c={c} onDelete={deleteCheck} />
          ))}
          {ordered.length > PREVIEW_COUNT && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="min-h-12 rounded-2xl bg-navy text-text-secondary text-sm font-bold neu-raised-sm neu-press transition-transform"
            >
              {expanded
                ? t("最近の5件だけ表示", "Show only the latest 5")
                : t(`全 ${ordered.length} 件を表示`, `Show all ${ordered.length} records`)}
            </button>
          )}
        </>
      )}
    </div>
  );
}
