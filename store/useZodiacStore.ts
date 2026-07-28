import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ZodiacKey } from "@/lib/zodiac";

interface ZodiacState {
  /** マイ星座。null = 未設定 → カード側は今日の太陽星座にフォールバック。 */
  selectedSign: ZodiacKey | null;
  setSelectedSign: (sign: ZodiacKey) => void;
}

/**
 * Plain-localStorage persist (like useSubjectStore/useMindStore), NOT the
 * per-user storage adapter — the sign preference must survive for anonymous
 * users too, and per-user storage no-ops while logged out.
 */
export const useZodiacStore = create<ZodiacState>()(
  persist(
    (set) => ({
      selectedSign: null,
      setSelectedSign: (sign) => set({ selectedSign: sign }),
    }),
    {
      name: "zodiac-sign",
      partialize: (s) => ({ selectedSign: s.selectedSign }),
    }
  )
);
