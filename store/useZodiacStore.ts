import { useRecordView, useUserRecordsStore } from "@/store/useUserRecordsStore";
import { ZODIAC_KEY } from "@/lib/sync/record-merge";
import { ZODIAC_KEYS, type ZodiacKey } from "@/lib/zodiac";

interface ZodiacState {
  /** マイ星座。null = 未設定 → カード側は今日の太陽星座にフォールバック。 */
  selectedSign: ZodiacKey | null;
  setSelectedSign: (sign: ZodiacKey) => void;
}

function setSelectedSign(sign: ZodiacKey): void {
  useUserRecordsStore.getState().put(ZODIAC_KEY, "setting", { sign });
}

const isZodiacKey = (v: unknown): v is ZodiacKey =>
  typeof v === "string" && (ZODIAC_KEYS as readonly string[]).includes(v);

/**
 * 置き場は store/useUserRecordsStore.ts（端末をまたいで同じにする記録）——未ログイン
 * でも端末に残り（per-user storage はログアウト中は何もしないので使わない）、
 * ログイン中はアカウントにも載って、どの端末でも同じ星座になる。以前は機能ごとの
 * localStorage（`zodiac-sign`）で、初回に移す。
 *
 * 形は以前の zustand ストアと同じ（`useZodiacStore((s) => s.selectedSign)`）。
 */
export function useZodiacStore<T>(selector: (s: ZodiacState) => T): T {
  const sign = useRecordView()[ZODIAC_KEY]?.data.sign;
  return selector({ selectedSign: isZodiacKey(sign) ? sign : null, setSelectedSign });
}
