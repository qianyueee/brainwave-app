import { useRecordView, useUserRecordsStore } from "@/store/useUserRecordsStore";
import { PARTNER_KEY } from "@/lib/sync/record-merge";
import { isPartnerRole, type PartnerRole } from "@/lib/partner";

/**
 * ホームの話し相手（Sync Partner）に選んだ役。置き場はマイ星座（store/useZodiacStore.ts）と
 * 同じ user_records の setting——未ログインでも端末に残り、ログイン中はアカウントにも載って
 * どの端末でも同じ相手になる（ログイン前に選んだ役は、アカウントにまだ無ければ黙って引き継ぐ）。
 * 新しい種類ではないので SQL は要らない。
 *
 * 描画中に読むので、静的 HTML の描画に出るところでは hydration の後にだけ使うこと
 * （SyncPartnerCard は mount するまで役を読まない）。
 */
export function usePartnerRole(): PartnerRole | null {
  const role = useRecordView()[PARTNER_KEY]?.data.role;
  return isPartnerRole(role) ? role : null;
}

export function setPartnerRole(role: PartnerRole): void {
  useUserRecordsStore.getState().put(PARTNER_KEY, "setting", { role });
}
