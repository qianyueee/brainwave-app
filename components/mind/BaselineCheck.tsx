"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Timer, X } from "lucide-react";
import { useMindStore, canReceiveData } from "@/store/useMindStore";
import { useBaselineStore } from "@/store/useBaselineStore";
import { useSubjectStore, activeSubject } from "@/store/useSubjectStore";
import { getAudioContext } from "@/lib/audio-context";
import type { EegSample } from "@/lib/mind/types";
import {
  BASELINE_PROTOCOL,
  BASELINE_MEASURE_SEC,
  computeBaselineScores,
  rateMethodLabel,
  type BaselinePhase,
} from "@/lib/mind/baseline";
import { scoreColor } from "@/lib/brain-measurements";

/**
 * 10秒クイックチェック（DAILY BRAIN CHECK）。
 *
 * 設計書の画面イメージそのまま：3・2・1 のカウントダウン → 5秒開眼 → チャイム
 * → 5秒閉眼 → 3指標。ボタン1つで始まって10秒で終わるので、毎朝・仕事前・
 * 退勤後に開く**習慣**として成立する（これが設計書の狙い）。
 *
 * 閉眼中は画面が見えないので、区間の切り替わりは必ず音でも伝える。音が出せない
 * 場面（別セッションを一時停止中で AudioContext が suspend されている等）でも
 * 破綻しないよう、進行は画面表示だけでも追えるようにしてある。
 */
export default function BaselineCheck({ onClose }: { onClose: () => void }) {
  const sourceKind = useMindStore((s) => s.sourceKind);
  const canReceive = useMindStore(canReceiveData);
  const record = useBaselineStore((s) => s.record);
  const subject = useSubjectStore(activeSubject);

  const [phase, setPhase] = useState<BaselinePhase>("idle");
  /** 現フェーズの残り秒（カウントダウン表示用）。 */
  const [remain, setRemain] = useState(0);
  const [result, setResult] = useState<ReturnType<typeof computeBaselineScores> | null>(null);

  // 収集中のサンプル。setState で持つと 1Hz ごとに再描画が走って
  // カウントダウンのアニメーションと競合するので ref に貯める。
  const openRef = useRef<EegSample[]>([]);
  const closeRef = useRef<EegSample[]>([]);
  const phaseRef = useRef<BaselinePhase>("idle");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  const setPhaseBoth = useCallback((p: BaselinePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  /**
   * 区間の合図。短い2音（上行）を合成する——アセットを持たずに済むうえ、
   * 再生中のプログラムに重なっても互いを壊さない（BinauralSession とは別の
   * 使い捨てノードとして同じ AudioContext に生やすだけ）。
   */
  const chime = useCallback(() => {
    try {
      const ctx = getAudioContext();
      // 一時停止中の AudioContext は resume してはいけない（ユーザーの意図を
      // 壊す）。鳴らせないときは黙って画面表示だけで進める。
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;
      for (const [i, freq] of [880, 1320].entries()) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = now + i * 0.16;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.36);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      }
    } catch {
      // 音が出せなくても計測自体は続く。
    }
  }, []);

  /** 1秒ごとに残り秒を刻む。フェーズ切り替えは下の setTimeout 群が受け持つ。 */
  const runCountdown = useCallback((secs: number) => {
    setRemain(secs);
    for (let i = 1; i <= secs; i++) {
      timersRef.current.push(setTimeout(() => setRemain(secs - i), i * 1000));
    }
  }, []);

  const start = useCallback(() => {
    clearTimers();
    openRef.current = [];
    closeRef.current = [];
    setResult(null);

    const { countdownSec, openSec, closeSec } = BASELINE_PROTOCOL;

    // 助走（計測に含めない）→ 開眼 → チャイム → 閉眼 → 判定
    setPhaseBoth("countdown");
    runCountdown(countdownSec);

    timersRef.current.push(
      setTimeout(() => {
        setPhaseBoth("open");
        runCountdown(openSec);
        chime();
      }, countdownSec * 1000)
    );

    timersRef.current.push(
      setTimeout(
        () => {
          setPhaseBoth("close");
          runCountdown(closeSec);
          chime();
        },
        (countdownSec + openSec) * 1000
      )
    );

    timersRef.current.push(
      setTimeout(
        () => {
          setPhaseBoth("done");
          setRemain(0);
          const scores = computeBaselineScores(openRef.current, closeRef.current);
          setResult(scores);
          // 使える秒が無い計測は記録しない（全指標 null の空レコードになる）。
          if (scores.usableSec > 0) {
            record({
              rate: scores.rate,
              clarity: scores.clarity,
              reset: scores.reset,
              method: scores.method,
              alphaRiseSec: scores.alphaRiseSec,
              alphaRatio: scores.alphaRatio,
              usableSec: scores.usableSec,
              source: sourceKind,
              subjectId: subject?.id,
              subjectName: subject?.name,
            });
          }
        },
        (countdownSec + openSec + closeSec) * 1000
      )
    );
  }, [chime, clearTimers, record, runCountdown, setPhaseBoth, sourceKind, subject]);

  // サンプルの取り込み。store を購読して、届いた秒を「そのとき居るフェーズ」の
  // 箱へ入れる。1Hz なので配列の添字＝そのフェーズ内の経過秒になり、
  // T_α-rise がそのまま添字から読める。
  useEffect(() => {
    let lastTs = 0;
    return useMindStore.subscribe((state) => {
      const s = state.latestSample;
      if (!s || s.ts === lastTs) return;
      lastTs = s.ts;
      if (phaseRef.current === "open") openRef.current.push(s);
      else if (phaseRef.current === "close") closeRef.current.push(s);
    });
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const running = phase === "countdown" || phase === "open" || phase === "close";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!running) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="10秒クイックチェック"
        className="w-full max-w-[420px] bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-4 neu-raised-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-text-primary">DAILY BRAIN CHECK</h2>
          <button
            onClick={onClose}
            disabled={running}
            aria-label="閉じる"
            className="w-12 h-12 shrink-0 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        {phase === "idle" && (
          <>
            <p className="text-base text-text-primary">
              10秒で今の脳の切り替え力を測ります。5秒間だけ画面を見て、
              チャイムが鳴ったら5秒間目を閉じてください。
            </p>
            <p className="text-sm text-text-muted">
              できるだけ動かず、まばたきは控えめに。音を出せる環境だと合図が分かりやすくなります
            </p>
            {/* データが来ていない状態で始めると、10秒かけて「読み取れません
                でした」に着地するだけ。始める前に止める。 */}
            <button
              onClick={start}
              disabled={!canReceive}
              className="min-h-[52px] rounded-2xl bg-primary text-on-primary text-lg font-bold neu-raised-sm neu-press transition-transform disabled:opacity-50 disabled:active:scale-100"
            >
              計測を始める
            </button>
            {!canReceive && (
              <p className="text-sm text-text-muted text-center">
                脳波データを待っています…（「接続する」から接続してください）
              </p>
            )}
          </>
        )}

        {running && (
          <>
            <p className="text-sm text-text-secondary text-center">
              {phase === "countdown" ? "まもなく始まります" : "＼ 今の脳の状態を計測中 ／"}
            </p>

            {/* 残り秒。閉眼中は見えないので、これは開眼中と助走のための表示。 */}
            <p
              className="text-center text-5xl font-mono font-bold tabular-nums text-primary"
              aria-live="polite"
            >
              {remain}
            </p>

            <ol className="flex flex-col gap-2">
              {(
                [
                  { key: "open", icon: Eye, label: `${BASELINE_PROTOCOL.openSec}秒間：目を開けて画面を見る` },
                  { key: "close", icon: EyeOff, label: `${BASELINE_PROTOCOL.closeSec}秒間：音に合わせて目を閉じる` },
                ] as const
              ).map((step) => {
                const active = phase === step.key;
                const Icon = step.icon;
                return (
                  <li
                    key={step.key}
                    className={`flex items-center gap-2.5 min-h-12 px-3 rounded-2xl text-base ${
                      active
                        ? "bg-navy-light text-primary neu-inset font-bold"
                        : "text-text-muted"
                    }`}
                  >
                    <Icon size={20} strokeWidth={active ? 2.5 : 1.5} className="shrink-0" />
                    <span className="min-w-0 flex-1">{step.label}</span>
                    {active && <span className="shrink-0 text-xs font-bold">今ココ</span>}
                  </li>
                );
              })}
            </ol>

            <p className="text-sm text-text-muted text-center">
              . . : : （ 息を吸って… 吐いて… ） : : . .
            </p>
          </>
        )}

        {phase === "done" && result && (
          <>
            {result.usableSec === 0 ? (
              <>
                <p className="text-base text-text-primary">
                  脳波を読み取れませんでした。ヘッドセットが額に密着しているかご確認のうえ、
                  もう一度お試しください。
                </p>
                <p className="text-sm text-text-muted">この計測は記録されません</p>
              </>
            ) : (
              <>
                <div className="rounded-2xl bg-navy neu-inset grid grid-cols-3 py-3">
                  {(
                    [
                      { title: "Rate", score: result.rate },
                      { title: "Clarity", score: result.clarity },
                      { title: "Reset", score: result.reset },
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
                        className="text-2xl font-mono font-bold tabular-nums leading-tight"
                        style={{
                          color:
                            m.score != null ? scoreColor(m.score) : "var(--dyn-text-muted)",
                        }}
                      >
                        {m.score ?? "—"}
                      </span>
                      <span className="text-xs font-bold text-text-primary">{m.title}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-1">
                  <p className="flex items-center gap-1.5 text-sm text-text-secondary">
                    <Timer size={16} strokeWidth={1.5} className="shrink-0" />
                    {rateMethodLabel(result.method)}
                  </p>
                  {result.alphaRiseSec != null && result.alphaRatio != null && (
                    <p className="text-xs text-text-muted">
                      α波の立ち上がり {result.alphaRiseSec}秒・閉眼／開眼のα比{" "}
                      {result.alphaRatio.toFixed(2)}倍
                    </p>
                  )}
                  <p className="text-xs text-text-muted">
                    有効データ {result.usableSec}/{BASELINE_MEASURE_SEC}秒
                    {sourceKind === "demo" && "・デモデータ（記録は実測と区別されます）"}
                  </p>
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={start}
                className="flex-1 min-h-[52px] rounded-2xl bg-navy text-text-secondary text-base font-bold neu-raised-sm neu-press transition-transform"
              >
                もう一度
              </button>
              <button
                onClick={onClose}
                className="flex-1 min-h-[52px] rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform"
              >
                閉じる
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
