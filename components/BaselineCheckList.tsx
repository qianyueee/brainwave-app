"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Timer, Trash2 } from "lucide-react";
import { useBaselineStore, type BaselineCheck } from "@/store/useBaselineStore";
import { BASELINE_MEASURE_SEC, rateMethodLabel } from "@/lib/mind/baseline";
import { scoreColor } from "@/lib/brain-measurements";

/** 最初に見せる件数。これ以上は「全 N 件を表示」で開く。 */
const PREVIEW_COUNT = 5;

function checkTime(c: BaselineCheck): string {
  return new Date(c.recordedAt).toLocaleString("ja-JP", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CheckRow({ c, onDelete }: { c: BaselineCheck; onDelete: (id: string) => void }) {
  const detail = [
    rateMethodLabel(c.method),
    c.alphaRiseSec != null ? `α立ち上がり ${c.alphaRiseSec}秒` : null,
    c.alphaRatio != null ? `閉眼／開眼のα比 ${c.alphaRatio.toFixed(2)}倍` : null,
    `有効データ ${c.usableSec}/${BASELINE_MEASURE_SEC}秒`,
  ]
    .filter(Boolean)
    .join("・");

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 flex flex-col gap-2 neu-raised">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-text-primary">{checkTime(c)}</p>
          <p className="text-xs text-text-muted">
            {[
              c.subjectName,
              // デモで取った回は必ずそう見せる（実測と並ぶ場所なので）。
              c.source === "demo" ? "デモデータ" : null,
            ]
              .filter(Boolean)
              .join("・") || "測定者の指定なし"}
          </p>
        </div>
        <button
          onClick={() => {
            if (window.confirm("この10秒チェックの記録を削除しますか？")) onDelete(c.id);
          }}
          aria-label="この記録を削除"
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
 * 同じ画面でも認証ゲートの**外**に置く。
 */
export default function BaselineCheckList() {
  const checks = useBaselineStore((s) => s.checks);
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
        <h2 className="text-xl font-bold text-text-primary">10秒チェックの記録</h2>
        <p className="text-sm text-text-secondary mt-1">
          保存した10秒チェックの Rate・Clarity・Reset
        </p>
      </div>

      {!hydrated ? null : ordered.length === 0 ? (
        <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised">
          <div className="flex justify-center mb-4">
            <Timer size={40} className="text-primary" strokeWidth={1.5} />
          </div>
          <p className="text-base font-bold text-text-primary mb-2">
            まだ記録がありません
          </p>
          <p className="text-sm text-text-secondary mb-6">
            シンク・ブレインの「10秒チェック」で測って保存すると、ここに残ります。
          </p>
          <Link
            href="/brain"
            className="inline-flex items-center justify-center min-h-12 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press"
          >
            10秒チェックへ
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
              {expanded ? "最近の5件だけ表示" : `全 ${ordered.length} 件を表示`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
