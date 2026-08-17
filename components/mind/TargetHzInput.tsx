"use client";

import { useEffect, useState } from "react";
import { useMindStore } from "@/store/useMindStore";
import {
  DEFAULT_TARGET_HZ,
  TARGET_HZ_MAX,
  TARGET_HZ_MIN,
  TARGET_HZ_STEP,
  formatTargetHz,
  normalizeTargetHz,
} from "@/lib/mind/resonance";

/**
 * 誘導周波数の入力。測定を始める前に、いま鳴らしている音が狙う Hz を受け取る。
 *
 * この値は測定に焼き込まれ、Rate の共鳴率をどの周波数で見るかを決める。未入力
 * なら既定の 40Hz——これまでずっと 40Hz 固定で判定していたので、何も入れなければ
 * 従来と同じ結果になる。
 *
 * 値は store 側に持たせて永続化する（コンポーネントの state に閉じない）：
 * 測定を開始するのは MindRecorder で、押した瞬間の値を焼き込む必要があるため。
 * 測定中は編集させない——走っている測定の条件が途中で変わったように見える。
 */
export default function TargetHzInput() {
  const targetHz = useMindStore((s) => s.targetHz);
  const setTargetHz = useMindStore((s) => s.setTargetHz);
  const isRecording = useMindStore((s) => s.isRecording);

  // 入力中の文字列（空欄＝未入力を表せる。数値 state だと 0 と未入力の区別が
  // つかない）。以後この欄だけが書き手なので、store とは開始時に一度だけ
  // 突き合わせる。初期値を空で始めるのは hydration mismatch を避けるため
  // ——persist から復元した値をサーバ描画に混ぜられない。
  const [text, setText] = useState("");
  useEffect(() => {
    const stored = useMindStore.getState().targetHz;
    if (stored != null) setText(formatTargetHz(stored));
  }, []);

  const commit = (raw: string) => {
    setText(raw);
    setTargetHz(normalizeTargetHz(parseFloat(raw)));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label
          htmlFor="target-hz"
          className="text-sm text-text-secondary shrink-0"
        >
          誘導周波数
        </label>
        <input
          id="target-hz"
          type="number"
          inputMode="decimal"
          step={TARGET_HZ_STEP}
          min={TARGET_HZ_MIN}
          max={TARGET_HZ_MAX}
          value={text}
          disabled={isRecording}
          onChange={(e) => commit(e.target.value)}
          // 離れた時点でレンジ内・0.01刻みへ揃える（打った値がそのまま判定に
          // 使われるので、丸めた結果を目に見せてから始める）。
          onBlur={() => setText(targetHz != null ? formatTargetHz(targetHz) : "")}
          placeholder={formatTargetHz(DEFAULT_TARGET_HZ)}
          aria-describedby="target-hz-hint"
          className="w-24 min-h-12 rounded-2xl bg-navy px-3 text-base font-mono tabular-nums text-text-primary text-right neu-inset outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-base font-bold text-text-secondary">Hz</span>
      </div>
      <p id="target-hz-hint" className="text-xs text-text-muted">
        {targetHz != null
          ? `Rate は ${formatTargetHz(targetHz)}Hz への共鳴で判定します`
          : `未入力のときは ${formatTargetHz(DEFAULT_TARGET_HZ)}Hz を基準に判定します（${TARGET_HZ_MIN}〜${TARGET_HZ_MAX}Hz・0.01Hz 刻み）`}
      </p>
    </div>
  );
}
