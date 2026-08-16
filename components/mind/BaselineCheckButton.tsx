"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { useMindStore, canReceiveData } from "@/store/useMindStore";
import { useBaselineStore } from "@/store/useBaselineStore";
import BaselineCheck from "./BaselineCheck";
import { BASELINE_MEASURE_SEC } from "@/lib/mind/baseline";

/**
 * 10秒クイックチェックの入口。「測定を開始」（腰を据えた計測）と並べて置く
 * ——設計書が描いている日常は「10秒で今の状態を知り、低ければ音響セッションを
 * 走らせる」なので、短い方が先に目に入る位置に居る必要がある。
 *
 * 測定中は開けない：ベースラインは"音を聴いていない平常時"を測るためのもので、
 * 録音中の脳波を混ぜたら前提が崩れる。
 */
export default function BaselineCheckButton() {
  const canReceive = useMindStore(canReceiveData);
  const isRecording = useMindStore((s) => s.isRecording);
  const consumeCheckRequest = useBaselineStore((s) => s.consumeCheckRequest);

  // ホームの「10秒 脳波測定をはじめる」から来たときは最初から開けておく。
  // 初期化時に読むので、到着後にデータが繋がるのを待つ必要がない——ダイアログ
  // は説明文から始まり、実際にデータが要るのは「計測を始める」を押した後。
  // その押下側を canReceive で塞いであるので、接続前に開いても破綻しない。
  // （フラグは永続化しないので、SSR も再読み込みも false 始まりで一致する。）
  const [open, setOpen] = useState(() => useBaselineStore.getState().autoOpenCheck);

  // 依頼は一度きり。残したままだと次にこのページへ来た瞬間にまた開く。
  useEffect(() => consumeCheckRequest(), [consumeCheckRequest]);

  const disabled = !canReceive || isRecording;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={`w-full flex items-center justify-center gap-2 min-h-[52px] rounded-2xl text-base font-bold border transition-colors neu-raised-sm ${
          disabled
            ? "bg-surface text-text-muted border-surface-border opacity-60"
            : "bg-navy text-primary border-transparent neu-press"
        }`}
      >
        <Timer size={20} strokeWidth={2} />
        {BASELINE_MEASURE_SEC}秒チェック
      </button>

      {open && <BaselineCheck onClose={() => setOpen(false)} />}
    </>
  );
}
