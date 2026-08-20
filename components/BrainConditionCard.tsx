"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrainCircuit, HeartPulse, Lightbulb, Moon, Timer, Zap } from "lucide-react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useBaselineStore, latestRealCheck } from "@/store/useBaselineStore";
import {
  computeBrainConditionMetrics,
  computeBaselineConditionMetrics,
} from "@/lib/brain-metrics";
import { scoreColor } from "@/lib/brain-measurements";
import { BASELINE_MEASURE_SEC } from "@/lib/mind/baseline";
import RangeSlider from "@/components/RangeSlider";
import {
  useSelfRatingStore,
  formatRecordedAt,
} from "@/store/useSelfRatingStore";

interface SelfRatingValues {
  switching: number;
  clarity: number;
  rest: number;
}

/**
 * 主観3軸。測定側の Rate / Clarity / Reset と**同じ3つ**を日常語にしたもので、
 * アイコンも測定側と揃えてある（⚡切り替え・💡明晰さ・🌙休息）。両端に言葉を
 * 置くのは、主観に「60点」のような絶対値は無いから——「ガチガチ寄りか、
 * スムーズ寄りか」という位置なら答えられる。
 *
 * そのうえで現在値を％で併記する（0-100、内部の保存値そのまま）。言葉だけだと
 * つまみが中央寄りのときに前回との差が確かめられず、上段の測定3値も同じ
 * 0-100 なのに突き合わせようが無かった。言葉が「どちら寄りか」、％が
 * 「どれくらいか」を担う分担。
 */
const SELF_AXES = [
  {
    key: "switching",
    icon: Zap,
    label: "スイッチ力",
    sub: "脳のメリハリ感",
    low: "ガチガチ",
    high: "スムーズ",
  },
  {
    key: "clarity",
    icon: Lightbulb,
    label: "ひらめき度",
    sub: "頭の透明感",
    low: "モヤモヤ",
    high: "クリア",
  },
  {
    key: "rest",
    icon: Moon,
    label: "休息度",
    sub: "脳のゆとり感",
    low: "疲れ",
    high: "リフレッシュ",
  },
] as const;

/** まだ一度も記録していない人が最初に見る位置。中央だと「未回答」に見える。 */
const DEFAULT_VALUES: SelfRatingValues = { switching: 60, clarity: 50, rest: 55 };

/**
 * ホームの脳コンディション統合カード。
 *
 * 上段「脳コンディション」の 3 値（Rate/Clarity/Reset）は**脳波測定からの自動
 * 算出**、下段「感コンディション」のスライダーは**ユーザーが入れる自己評価**
 * ——出どころの違う 2 種類が 1 枚に同居するので、上段は溝（インセット）に沈めて
 * 「読むもの」、下段は面の上に置いて「触るもの」と手触りで分けたうえ、
 * それぞれに見出しとアイコンを付けて言葉でも切っている。
 *
 * 下段の3軸は上段と**同じ軸**（切り替え／明晰さ／休息）の主観版。だから
 * 「自分ではスムーズなつもりだったが Rate は低い」と読める。以前の
 * リラックス度／集中度／睡眠の質 は測定側と軸がずれていて、上下に並べても
 * 比較にならなかった。
 *
 * 締めのボタンは10秒の脳波測定へ——主観を入れた直後に客観を測るから、同じ
 * 瞬間の2つが並ぶ。数値は Sync Report と同じ store・同じ計算を通すので、
 * どちらの画面で見ても常に一致する。
 */
export default function BrainConditionCard() {
  const router = useRouter();
  const storeProfile = useBrainProfileStore((s) => s.profile);
  const storeCheck = useBaselineStore(latestRealCheck);
  const requestCheck = useBaselineStore((s) => s.requestCheck);
  const latest = useSelfRatingStore((s) => s.latest);
  const record = useSelfRatingStore((s) => s.record);

  // Guard hydration mismatch from the persisted stores
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const profile = hydrated ? storeProfile : null;
  const check = hydrated ? storeCheck : null;

  // 出どころの自動切り替え（設計書「測定モードの自動切り替え構造」）。
  // セッション由来の脳特性と、平常時の10秒ベースラインは**別の測り方**なので、
  // 混ぜず・平均せず、単に新しい方を今の状態として出す。片方しか無ければそれ。
  const useBaseline =
    check != null && (profile == null || check.recordedAt > profile.uploadedAt);
  const metrics = useBaseline
    ? computeBaselineConditionMetrics(check)
    : computeBrainConditionMetrics(profile);
  const sourceLabel = useBaseline ? "10秒クイックチェック" : "直近脳波測定データ";

  // つまみを動かすまでは draft = null で、表示は保存値（無ければ初期値）を
  // そのまま見せる。effect で store → state を写すのではなく描画時に解決する
  // ので、persist の hydrate が遅れて届いても値が飛ばない。
  const [draft, setDraft] = useState<SelfRatingValues | null>(null);
  const values: SelfRatingValues = draft ??
    (hydrated && latest
      ? { switching: latest.switching, clarity: latest.clarity, rest: latest.rest }
      : DEFAULT_VALUES);

  const now = new Date();

  // 主観を記録してから測定へ。順番が逆だと、測定結果を見たあとの主観になって
  // しまい「自分の感覚」ではなく「数字への反応」を記録することになる。
  const handleCheck = () => {
    record(values);
    requestCheck();
    router.push("/brain");
  };

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 flex flex-col gap-4 neu-raised">
      {/* 測定由来のブロック — 見出し／3値／出どころと測定導線 */}
      <div className="flex flex-col gap-2">
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
        <div className="rounded-2xl bg-navy neu-inset grid grid-cols-3 py-3">
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

        {/* 3値が何の数字か（＝どちらのモードで測ったか）を明示し、
            その場で測り直せる導線 */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-text-muted">{sourceLabel}</span>
          <Link
            href="/brain"
            className="inline-flex items-center min-h-12 -my-2 px-1 -mx-1 text-xs text-primary font-medium"
          >
            今すぐ測定へ →
          </Link>
        </div>
      </div>

      {/* 自己評価 — 測定と同じ3軸を、主観の言葉で */}
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <HeartPulse size={18} strokeWidth={1.5} className="shrink-0 text-accent" />
          今の「感コンディション」をチェック
        </p>
        {SELF_AXES.map((axis) => {
          const Icon = axis.icon;
          return (
            <div key={axis.key} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-1.5">
                <label
                  htmlFor={`self-${axis.key}`}
                  className="flex items-baseline gap-1.5 min-w-0 text-sm font-medium text-text-primary"
                >
                  <Icon
                    size={16}
                    strokeWidth={2}
                    className="shrink-0 self-center text-primary"
                  />
                  {axis.label}
                  <span className="text-xs font-normal text-text-muted">（{axis.sub}）</span>
                </label>
                {/* いま何％かを見出し行の右端に。両端の言葉だけだと、つまみが
                    真ん中寄りのときに「前回より上げたつもり」が確かめられず、
                    上段の測定3値（同じ0-100）とも突き合わせられなかった。

                    ・`tabular-nums`：ドラッグ中に桁が変わっても数字の幅が
                      変わらない（等幅でないと 1 と 8 で行がにじむ）
                    ・`ml-auto` で右寄せ＝伸び縮みは左側の余白が吸うので、
                      60%→100% で桁が増えても右端は動かない
                    ・色は accent＝この下段ブロック（主観）の色。上段の測定値は
                      スコア色なので、同じ 0-100 でも出どころが色で分かる
                    ・`aria-hidden`：値は input[type=range] 自身が読み上げる。
                      label の中に入れると入力欄の名前が「スイッチ力…60%」に
                      なってドラッグのたびに名前が変わってしまうので、label の
                      外に出したうえで支援技術からは隠す */}
                <span
                  aria-hidden="true"
                  className="ml-auto shrink-0 text-sm font-bold tabular-nums text-accent"
                >
                  {values[axis.key]}%
                </span>
              </div>
              {/* 両端の言葉が「どちら寄りか」を、右上の％が「どれくらいか」を
                  担う。幅を固定して3本のスライダーの左右端を揃える——揃って
                  いないと、同じ位置なのに違う位置に見えて比較にならない。
                  幅は最長の語が折り返さない実寸＋わずかな余裕：左は4文字
                  （ガチガチ）、右は6文字（リフレッシュ）。`text-xs` が 14→12px になったぶん
                  56/96px から詰めてある——文字が縮んでも枠を据え置くと、
                  余った 24px がそのままスライダーの可動域から削られる。 */}
              <div className="flex items-center gap-2">
                <span className="w-13 shrink-0 text-xs text-text-muted">{axis.low}</span>
                <RangeSlider
                  id={`self-${axis.key}`}
                  min={0}
                  max={100}
                  value={values[axis.key]}
                  onChange={(e) =>
                    setDraft({ ...values, [axis.key]: Number(e.target.value) })
                  }
                  className="flex-1 min-w-0"
                />
                <span className="w-20 shrink-0 text-right text-xs text-text-muted whitespace-nowrap">
                  {axis.high}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 締めは測定への導線。押すとスライダーの主観を保存してから Sync Brain の
          10秒計測へ入る——「こう感じている」と「脳波はこう出た」が同じ瞬間の
          ペアで残るので、次に開いたとき上段と下段を突き合わせて読める。 */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={handleCheck}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-navy text-primary text-base font-bold neu-raised-sm neu-press active:scale-95 transition-transform"
        >
          <Timer size={20} strokeWidth={2} />
          {BASELINE_MEASURE_SEC}秒 脳波測定をはじめる
        </button>
        {hydrated && latest && (
          <span className="text-xs text-text-muted text-center">
            前回：{formatRecordedAt(latest.recordedAt, now)}
          </span>
        )}
      </div>
    </div>
  );
}
