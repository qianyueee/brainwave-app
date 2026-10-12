"use client";

import { useEffect, useState } from "react";
import { getTodaySky, type TodaySky } from "@/lib/zodiac";

/** 開いたままでも空を数え直す間隔。月は約2.5日で星座を移り、昼夜は 6時・18時で替わる。 */
const REFRESH_MS = 10 * 60 * 1000;

export interface TodaySkyState {
  /** いまの太陽・月の星座（計算前・失敗時は null） */
  sky: TodaySky | null;
  /** 一度も計算できなかった */
  failed: boolean;
  /** sky を計算した時刻（おすすめの時間帯・曜日の判定に使う） */
  now: Date;
}

/**
 * 今日の空（星座カード・Water Mandala 共用）。開いた時に1回だけ数えると、
 * アプリを開いたまま日付・時間帯をまたいでもおすすめが前日のまま残るので、
 * 画面に戻ったときと 10 分ごとに数え直す。数え直しの間は前の空を出したまま。
 */
export function useTodaySky(): TodaySkyState {
  const [state, setState] = useState<TodaySkyState>(() => ({
    sky: null,
    failed: false,
    now: new Date(),
  }));

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      const now = new Date();
      getTodaySky(now)
        .then((sky) => {
          if (!cancelled) setState({ sky, failed: false, now });
        })
        .catch(() => {
          // 一度計算できていれば前の空を残す（読み込み直しの失敗で消さない）
          if (!cancelled) setState((s) => (s.sky ? s : { ...s, failed: true }));
        });
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return state;
}
