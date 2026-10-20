import { useMemo } from "react";
import { useUserRecordsStore } from "@/store/useUserRecordsStore";
import {
  ANON_SCOPE,
  favoriteIdsOf,
  favoriteKey,
  viewOf,
  type RecordMap,
  type StoredRecord,
} from "@/lib/sync/record-merge";

/**
 * マイフォルダ（Sync Session のお気に入り）。カードの ♡ で入れ・外しする。
 *
 * 置き場は store/useUserRecordsStore.ts（端末をまたいで同じにする記録）に、
 * プログラム1つにつき1件（`favorite:<programId>`）——未ログインでも端末に残り、
 * ログイン中はアカウントにも載って、Web・Android・Windows のどれでも同じフォルダに
 * なる。ログインしたときに端末で入れていた分は、アカウントに無いものだけ黙って
 * 引き継ぐ（マイ星座・測定者と同じ。lib/sync/record-merge.ts の KIND_RULES）。
 *
 * カードは一覧に 100 枚を超えて並ぶので、1枚ずつが記録の全件（再生の記録で
 * 数百件になる）を重ね直さないよう、中身はここで1回だけ組んで覚えておく。
 */

interface Favorites {
  /** 入れた順（古い順）。 */
  ids: readonly string[];
  set: ReadonlySet<string>;
}

/** マイフォルダの記録だけを抜き出す（無ければ undefined＝空と同じ）。 */
function pick(map: RecordMap | undefined): RecordMap | undefined {
  if (!map) return undefined;
  let out: Record<string, StoredRecord> | undefined;
  for (const [key, r] of Object.entries(map)) {
    if (r.kind === "favorite") (out ??= {})[key] = r;
  }
  return out;
}

// 直前の材料と結果。材料（スコープの記録）は書き換えのたびに別のオブジェクトに
// なるので、同じなら同じ結果を返してよい。
let memo: { user: RecordMap | undefined; anon: RecordMap | undefined; value: Favorites } | null = null;

function favoritesOf(user: RecordMap | undefined, anon: RecordMap | undefined): Favorites {
  if (memo && memo.user === user && memo.anon === anon) return memo.value;
  const ids = favoriteIdsOf(viewOf(pick(user), pick(anon)));
  const value = { ids, set: new Set(ids) };
  memo = { user, anon, value };
  return value;
}

type RecordsState = ReturnType<typeof useUserRecordsStore.getState>;

/** 画面と同じ重ね方（useRecordView）：ログイン中はアカウント ∪ 端末、ログアウト中は端末だけ。 */
const userOf = (s: RecordsState) => (s.scope === ANON_SCOPE ? undefined : s.scopes[s.scope]);
const anonOf = (s: RecordsState) => s.scopes[ANON_SCOPE];

/** マイフォルダに入っているプログラムの id（入れた順）。persist 由来なので描くのは mount 後に。 */
export function useFavoriteIds(): readonly string[] {
  const user = useUserRecordsStore(userOf);
  const anon = useUserRecordsStore(anonOf);
  return useMemo(() => favoritesOf(user, anon).ids, [user, anon]);
}

/** そのプログラムがマイフォルダに入っているか（カード1枚ぶん。真偽値だけを購読する）。 */
export function useIsFavorite(programId: string): boolean {
  return useUserRecordsStore((s) => favoritesOf(userOf(s), anonOf(s)).set.has(programId));
}

/** 入れる／外す。外すとアカウントには墓標が残り、別の端末からも消える。 */
export function setFavorite(programId: string, on: boolean): void {
  const key = favoriteKey(programId);
  if (!key) return;
  const s = useUserRecordsStore.getState();
  const isOn = favoritesOf(userOf(s), anonOf(s)).set.has(programId);
  if (on === isOn) return;
  if (on) s.put(key, "favorite", { programId });
  else s.remove(key);
}

export function toggleFavorite(programId: string): void {
  const s = useUserRecordsStore.getState();
  setFavorite(programId, !favoritesOf(userOf(s), anonOf(s)).set.has(programId));
}
