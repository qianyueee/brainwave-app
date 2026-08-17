"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, Timer, X } from "lucide-react";
import { useMindStore, canReceiveData } from "@/store/useMindStore";
import { useBaselineStore } from "@/store/useBaselineStore";
import { useSubjectStore, activeSubject } from "@/store/useSubjectStore";
import { getAudioContext } from "@/lib/audio-context";
import type { EegSample } from "@/lib/mind/types";
import {
  BASELINE_PROTOCOL,
  BASELINE_MEASURE_SEC,
  TARGET_HZ_MIN,
  TARGET_HZ_MAX,
  TARGET_HZ_STEP,
  TARGET_HZ_DEFAULT,
  computeBaselineScores,
  formatTargetHz,
  normalizeTargetHz,
  rateMethodLabel,
  type BaselinePhase,
} from "@/lib/mind/baseline";
import { scoreColor } from "@/lib/brain-measurements";

/**
 * 誘導周波数の早押し。プログラムが実際に使う差周波数から、よく使う4つを
 * 0.1Hz 刻みに丸めて並べる（7.83 → 7.8）。小数点付きの数字を毎回スマホで
 * 打つのは 50〜60代には厳しいので、既定の入力手段はこちら。
 */
const TARGET_HZ_PRESETS = [4, 7.8, 10, 40] as const;

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
  const setLastTargetHz = useBaselineStore((s) => s.setLastTargetHz);
  const subject = useSubjectStore(activeSubject);

  // 誘導周波数は文字列で持つ（空欄＝指定なしを表せる。数値 state だと 0 と
  // 未入力の区別がつかない）。初期値は前回の値、無ければ 40.0。
  const [hzInput, setHzInput] = useState(() =>
    formatTargetHz(useBaselineStore.getState().lastTargetHz ?? TARGET_HZ_DEFAULT)
  );
  const targetHz = normalizeTargetHz(parseFloat(hzInput));

  const [phase, setPhase] = useState<BaselinePhase>("idle");
  /** 現フェーズの残り秒（カウントダウン表示用）。 */
  const [remain, setRemain] = useState(0);
  const [result, setResult] = useState<ReturnType<typeof computeBaselineScores> | null>(null);
  /** この結果を保存済みか。保存は明示操作——測ったものが全部残るとは限らない
   *  （練習・装着確認・話しかけられた回）ので、残すかどうかは本人が決める。 */
  const [saved, setSaved] = useState(false);

  // 収集中のサンプル。setState で持つと 1Hz ごとに再描画が走って
  // カウントダウンのアニメーションと競合するので ref に貯める。
  const openRef = useRef<EegSample[]>([]);
  const closeRef = useRef<EegSample[]>([]);
  const phaseRef = useRef<BaselinePhase>("idle");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** 開始時点の誘導周波数を焼き込む。判定は10秒後に走るので、その間に入力が
   *  変わっても「測ったときの基準」で採点する。 */
  const targetHzRef = useRef<number | null>(null);

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
    setSaved(false);
    targetHzRef.current = targetHz;
    setLastTargetHz(targetHz);

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
          // 結果は出すだけ。保存は下の handleSave（明示操作）が行う。
          setResult(
            computeBaselineScores(openRef.current, closeRef.current, targetHzRef.current)
          );
        },
        (countdownSec + openSec + closeSec) * 1000
      )
    );
  }, [chime, clearTimers, runCountdown, setPhaseBoth, targetHz, setLastTargetHz]);

  /** 説明＋誘導周波数の画面へ戻す。「もう一度」はここを通す——Hz は計測ごとの
   *  条件なので、測り直す前に必ず確認・変更できるようにしておく。 */
  const backToStart = useCallback(() => {
    clearTimers();
    setResult(null);
    setSaved(false);
    setRemain(0);
    setPhaseBoth("idle");
  }, [clearTimers, setPhaseBoth]);

  const handleSave = () => {
    // 使える秒が無い計測は保存させない（全指標 null の空レコードになる）。
    if (!result || result.usableSec === 0 || saved) return;
    record({
      rate: result.rate,
      clarity: result.clarity,
      reset: result.reset,
      method: result.method,
      targetHz: result.targetHz,
      lockSec: result.lockSec,
      peakRatio: result.peakRatio,
      alphaRiseSec: result.alphaRiseSec,
      alphaRatio: result.alphaRatio,
      usableSec: result.usableSec,
      source: sourceKind,
      subjectId: subject?.id,
      subjectName: subject?.name,
    });
    setSaved(true);
  };

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
        // 誘導周波数の入力ぶんだけ縦に伸びるので、小さい画面では中身を
        // スクロールさせる（ダイアログごと画面外へ出ると開始ボタンに届かない）。
        className="w-full max-w-[420px] max-h-[90vh] overflow-y-auto bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-4 neu-raised-lg"
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

            {/* 誘導周波数 — Rate の基準。いま鳴らしている音が狙う Hz を先に
                受け取っておき、その周波数へどれだけ速く・はっきり乗れたかで
                採点する（空欄なら従来どおり開眼⇄閉眼の応答で測る）。 */}
            <div className="flex flex-col gap-2 rounded-2xl bg-navy neu-inset p-4">
              <label
                htmlFor="baseline-target-hz"
                className="text-base font-bold text-text-primary"
              >
                誘導周波数
              </label>
              <p className="text-sm text-text-muted">
                いま聴いている音が狙う周波数です。この Hz にどれだけ速く・はっきり
                乗れたかで Rate を出します
              </p>

              <div className="flex items-center gap-2">
                <input
                  id="baseline-target-hz"
                  type="number"
                  inputMode="decimal"
                  step={TARGET_HZ_STEP}
                  min={TARGET_HZ_MIN}
                  max={TARGET_HZ_MAX}
                  value={hzInput}
                  onChange={(e) => setHzInput(e.target.value)}
                  // 離れた時点でレンジ内・0.1刻みへ揃える（打った値がそのまま
                  // 採点に使われるので、丸めた結果を目に見せてから始める）。
                  onBlur={() =>
                    setHzInput(targetHz != null ? formatTargetHz(targetHz) : "")
                  }
                  placeholder="指定しない"
                  className="w-32 min-h-12 rounded-2xl bg-surface px-4 text-xl font-mono tabular-nums text-text-primary text-right neu-raised-sm outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-lg font-bold text-text-secondary">Hz</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {TARGET_HZ_PRESETS.map((hz) => {
                  const active = targetHz === hz;
                  return (
                    <button
                      key={hz}
                      onClick={() => setHzInput(formatTargetHz(hz))}
                      aria-pressed={active}
                      className={`min-h-12 px-4 rounded-2xl text-sm font-bold tabular-nums transition-colors ${
                        active
                          ? "bg-primary text-on-primary"
                          : "bg-surface text-text-secondary neu-raised-sm neu-press"
                      }`}
                    >
                      {formatTargetHz(hz)}Hz
                    </button>
                  );
                })}
                <button
                  onClick={() => setHzInput("")}
                  aria-pressed={targetHz == null}
                  className={`min-h-12 px-4 rounded-2xl text-sm font-bold transition-colors ${
                    targetHz == null
                      ? "bg-primary text-on-primary"
                      : "bg-surface text-text-secondary neu-raised-sm neu-press"
                  }`}
                >
                  指定しない
                </button>
              </div>

              <p className="text-xs text-text-muted">
                {targetHz == null
                  ? "誘導音なしとして、開眼⇄閉眼テスト（Berger応答）で Rate を出します"
                  : `${formatTargetHz(targetHz)}Hz への引き込みで Rate を出します（${TARGET_HZ_MIN}〜${TARGET_HZ_MAX}Hz・0.1Hz 刻み）`}
              </p>
            </div>
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
                    {rateMethodLabel(result.method, result.targetHz)}
                  </p>
                  {result.method === "entrainment" &&
                    (result.lockSec != null && result.peakRatio != null ? (
                      <p className="text-xs text-text-muted">
                        引き込みまで {result.lockSec}秒・ピークは周囲の{" "}
                        {result.peakRatio.toFixed(2)}倍
                      </p>
                    ) : (
                      <p className="text-xs text-text-muted">
                        この10秒では、その周波数の立ち上がりは見られませんでした
                      </p>
                    ))}
                  {/* 誘導周波数を入れたのに引き込みで測れなかった回（スペクトルを
                      持たないブリッジ）は、なぜ別の方法になったのかを言う。 */}
                  {result.method !== "entrainment" && result.targetHz != null && (
                    <p className="text-xs text-text-muted">
                      周波数ごとの強さを取得できなかったため、
                      {formatTargetHz(result.targetHz)}Hz は判定に使えませんでした
                    </p>
                  )}
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

            {/* 保存は明示操作。測っただけの回（装着確認・練習・中断）まで
                履歴に積むと、ホームの3指標や推移が濁る。 */}
            {result.usableSec === 0 ? (
              <div className="flex gap-3">
                <button
                  onClick={backToStart}
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
            ) : saved ? (
              <>
                <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-success">
                  <Check size={18} strokeWidth={2.5} />
                  記録しました
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={backToStart}
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
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 min-h-[52px] rounded-2xl bg-navy text-text-secondary text-base font-bold neu-raised-sm neu-press transition-transform"
                >
                  保存しない
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 min-h-[52px] rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform"
                >
                  記録を保存
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
