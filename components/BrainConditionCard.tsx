"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BrainCircuit, HeartPulse } from "lucide-react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { computeBrainConditionMetrics } from "@/lib/brain-metrics";
import { scoreColor } from "@/lib/brain-measurements";
import RangeSlider from "@/components/RangeSlider";
import {
  useSelfRatingStore,
  formatRecordedAt,
  isSameDay,
} from "@/store/useSelfRatingStore";

interface SelfRatingValues {
  relax: number;
  focus: number;
  sleep: number;
}

/** まだ一度も記録していない人が最初に見る位置。 */
const DEFAULT_VALUES: SelfRatingValues = { relax: 60, focus: 55, sleep: 70 };

/**
 * ホームの脳コンディション統合カード。
 *
 * 上段「脳コンディション」の 3 値（Rate/Clarity/Reset）は**脳波測定からの自動
 * 算出**、下段「感コンディション」のスライダーは**ユーザーが毎日入れる自己
 * 評価**——出どころの違う 2 種類が 1 枚に同居するので、上段は溝（インセット）
 * に沈めて「読むもの」、下段は面の上に置いて「触るもの」と手触りで分けたうえ、
 * それぞれに見出しとアイコンを付けて言葉でも切っている。
 *
 * 数値は Sync Report と同じ store・同じ computeBrainConditionMetrics を通す
 * ので、どちらの画面で見ても常に一致する。
 */
export default function BrainConditionCard() {
  const storeProfile = useBrainProfileStore((s) => s.profile);
  const latest = useSelfRatingStore((s) => s.latest);
  const record = useSelfRatingStore((s) => s.record);

  // Guard hydration mismatch from the persisted stores
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const profile = hydrated ? storeProfile : null;
  const metrics = computeBrainConditionMetrics(profile);

  // つまみを動かすまでは draft = null で、表示は保存値（無ければ初期値）を
  // そのまま見せる。effect で store → state を写すのではなく描画時に解決する
  // ので、persist の hydrate が遅れて届いても値が飛ばない。
  const [draft, setDraft] = useState<SelfRatingValues | null>(null);
  const values: SelfRatingValues = draft ??
    (hydrated && latest
      ? { relax: latest.relax, focus: latest.focus, sleep: latest.sleep }
      : DEFAULT_VALUES);

  const now = new Date();
  const recordedToday = hydrated && latest != null && isSameDay(latest.recordedAt, now);

  const sliders = [
    { key: "relax", label: "リラックス度" },
    { key: "focus", label: "集中度" },
    { key: "sleep", label: "睡眠の質" },
  ] as const;

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-5 flex flex-col gap-5 neu-raised">
      {/* 測定由来のブロック — 見出し／3値／出どころと測定導線 */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <BrainCircuit size={18} strokeWidth={1.5} className="shrink-0 text-primary" />
            脳コンディション
          </p>
          {/* 分析は Sync Report、測定は下の「今すぐ測定へ」で /brain —
              読む先と入力する先を別の導線に分けている */}
          <Link
            href="/report"
            className="inline-flex items-center min-h-12 -my-2 px-1 -mx-1 text-xs text-primary font-medium"
          >
            詳細へ →
          </Link>
        </div>

        {/* 測定値 — 溝に沈めた 3 値。区切り線は最後の1つを除いて引く */}
        <div className="rounded-2xl bg-navy neu-inset grid grid-cols-3 py-4">
          {metrics.map((m, i) => (
            <div
              key={m.key}
              title={m.fullName}
              className={
                "flex flex-col items-center gap-0.5 px-1" +
                (i < metrics.length - 1 ? " border-r border-surface-border" : "")
              }
            >
              <span
                className="text-2xl font-mono font-bold tabular-nums leading-tight"
                style={{
                  color: m.score != null ? scoreColor(m.score) : "var(--dyn-text-muted)",
                }}
              >
                {m.score != null ? m.score : "—"}
              </span>
              <span className="text-xs font-bold text-text-primary">{m.title}</span>
            </div>
          ))}
        </div>

        {/* 3値が何の数字か（＝直近の脳波測定）を明示し、その場で測り直せる導線 */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-text-muted">直近脳波測定データ</span>
          <Link
            href="/brain"
            className="inline-flex items-center min-h-12 -my-2 px-1 -mx-1 text-xs text-primary font-medium"
          >
            今すぐ測定へ →
          </Link>
        </div>
      </div>

      {/* 自己評価 — 測定とは独立した毎日の主観入力 */}
      <div className="flex flex-col gap-3.5">
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <HeartPulse size={18} strokeWidth={1.5} className="shrink-0 text-accent" />
          感コンディション
        </p>
        {sliders.map((s) => (
          <div key={s.key} className="flex items-center gap-2.5">
            <label
              htmlFor={`self-${s.key}`}
              className="w-24 shrink-0 text-sm font-medium text-text-primary"
            >
              {s.label}
            </label>
            <RangeSlider
              id={`self-${s.key}`}
              min={0}
              max={100}
              value={values[s.key]}
              onChange={(e) =>
                setDraft({ ...values, [s.key]: Number(e.target.value) })
              }
              className="flex-1"
            />
            <span className="w-9 text-right text-base font-mono font-bold tabular-nums text-primary">
              {values[s.key]}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => record(values)}
          className="flex-1 h-12 rounded-2xl bg-navy text-primary text-sm font-bold neu-raised-sm neu-press active:scale-95 transition-transform"
        >
          {recordedToday ? "記録を更新する" : "記録する"}
        </button>
        <span className="text-xs text-text-muted">
          {hydrated && latest
            ? `毎日1回・前回 ${formatRecordedAt(latest.recordedAt, now)}`
            : "毎日1回"}
        </span>
      </div>
    </div>
  );
}
