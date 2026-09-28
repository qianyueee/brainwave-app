/**
 * 端末をまたいで同じにする小さな記録（振り返り・再生の記録・感コンディション・
 * 測定者・マイ星座）の合わせ方。**純関数だけ・型以外の import なし**——node で
 * 直接確かめられる（scripts/check-records.mjs）。
 *
 * きまり（アカウント側は supabase/migrations/005_user_records.sql が同じことをする）：
 * - **新しい方が勝つ**。比べるのは、その記録を書き換えた時刻 `updatedAt`。
 * - **消すときも消さずに「消した」印（墓標）を残す**——別の端末に「消した」ことが
 *   届き、古い記録を持った端末が送り直しても復活しない。
 * - 端末の中では記録を**スコープ**ごとに分けて持つ：`anon`＝ログインしていない間に
 *   書いたもの、`<userId>`＝そのアカウントのもの。共用の端末で別の人がログインしても、
 *   前の人の記録はその人のスコープにあって見えない。
 *
 * 種類ごとの違い（KIND_RULES）：
 * - 振り返り・再生の記録は「その人の出来事」なので、ログイン前に書いた分をアカウントへ
 *   移すかは**尋ねる**（AccountSaveBanner）。画面にはアカウントの分と端末の分を重ねて出す。
 * - マイ星座・感コンディションは「いまの設定」なので、ログイン中は**アカウントの値**を
 *   出す（どの端末でも同じ星座）。アカウントにまだ値が無ければ端末の値をそのまま
 *   引き継ぐ（尋ねない）。
 * - 測定者は名前の一覧。重ねて出し、アカウントに無い名前は引き継ぐ（尋ねない）。
 */

export const RECORD_KINDS = ["journal", "playback", "self_rating", "subject", "setting"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export function isRecordKind(v: unknown): v is RecordKind {
  return typeof v === "string" && (RECORD_KINDS as readonly string[]).includes(v);
}

/**
 * - display：`union`＝アカウント ∪ 端末（同じキーは新しい方）／`account`＝ログイン中は
 *   アカウントに値（墓標を含む）があればそれ、無ければ端末の値
 * - adopt：ログイン前に端末で書いた分を `ask`＝「保存しますか？」で尋ねる／`auto`＝
 *   アカウントに無いものだけ黙って引き継ぐ
 */
export const KIND_RULES: Record<RecordKind, { display: "union" | "account"; adopt: "ask" | "auto" }> = {
  journal: { display: "union", adopt: "ask" },
  playback: { display: "union", adopt: "ask" },
  self_rating: { display: "account", adopt: "auto" },
  setting: { display: "account", adopt: "auto" },
  subject: { display: "union", adopt: "auto" },
};

export type RecordData = Record<string, unknown>;

/** 端末に持つ1件。 */
export interface StoredRecord {
  kind: RecordKind;
  data: RecordData;
  /** 書き換えた時刻（ISO）。 */
  updatedAt: string;
  /** 消した印（墓標）。data は空。 */
  deleted?: true;
  /** アカウントへまだ送っていない（アカウントのスコープでだけ意味を持つ）。 */
  dirty?: true;
  /**
   * anon スコープでだけ意味を持つ：「アカウントに保存しない」と答えた、または
   * もうアカウントへ引き継いだ（二度目の引き継ぎ・問いかけをしない）。
   */
  localOnly?: true;
}

/** キー（"journal:2026-09-27" など、種類が頭に付く）→ 記録。 */
export type RecordMap = Readonly<Record<string, StoredRecord>>;

/** アカウントとやり取りする形（lib/sync/records.ts）。 */
export interface RemoteRecord {
  key: string;
  kind: RecordKind;
  data: RecordData;
  deleted: boolean;
  updatedAt: string;
}

/** ログインしていない間に書いた記録のスコープ。 */
export const ANON_SCOPE = "anon";

/**
 * いつ決めたか分からない値（以前の端末のマイ星座・最初からある「自分」）の時刻。
 * 本当に書き換えた記録・消した記録には必ず負ける。
 */
export const EPOCH = new Date(0).toISOString();

const EMPTY: RecordMap = Object.freeze({});

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** a が b より新しいか。 */
export function isNewer(a: string, b: string): boolean {
  return ms(a) > ms(b);
}

/**
 * 手元で書き換えるときの時刻。いまの時刻が手元の同じ記録（＝最後に見た版）より
 * 古ければ、その 1ms 後にする——時計の遅れた端末で書き直しても、見ていた版に
 * 負けて書き直しが消えないように（アカウント側は未来の時刻を丸めるが、遅れは直せない）。
 */
export function nextStamp(now: Date, current?: StoredRecord): string {
  const t = now.getTime();
  if (current && ms(current.updatedAt) >= t) {
    return new Date(ms(current.updatedAt) + 1).toISOString();
  }
  return now.toISOString();
}

/** 書く。`dirty`＝アカウントへ送る（アカウントのスコープに書くとき）。`at` は時刻の指定（既定値の種）。 */
export function putRecord(
  map: RecordMap,
  key: string,
  kind: RecordKind,
  data: RecordData,
  opts: { now: Date; dirty: boolean; at?: string }
): RecordMap {
  const rec: StoredRecord = { kind, data, updatedAt: opts.at ?? nextStamp(opts.now, map[key]) };
  if (opts.dirty) rec.dirty = true;
  return { ...map, [key]: rec };
}

/**
 * 消す。アカウントのスコープ（`tombstone`）なら墓標を残して送る。anon なら墓標は
 * 要らない（どこへも送らない）ので、キーごと落とす。
 */
export function removeRecord(
  map: RecordMap,
  key: string,
  opts: { now: Date; tombstone: boolean }
): RecordMap {
  const cur = map[key];
  if (!cur || cur.deleted) return map;
  if (!opts.tombstone) {
    const next = { ...map };
    delete next[key];
    return next;
  }
  return {
    ...map,
    [key]: {
      kind: cur.kind,
      data: {},
      updatedAt: nextStamp(opts.now, cur),
      deleted: true,
      dirty: true,
    },
  };
}

/** キーの並びに左右されない JSON（jsonb はキーを並べ替えて返すので、そのまま比べると違って見える）。 */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

function sameAsRemote(cur: StoredRecord, r: RemoteRecord): boolean {
  if (!!cur.deleted !== r.deleted || cur.updatedAt !== r.updatedAt || cur.kind !== r.kind) {
    return false;
  }
  return r.deleted || stable(cur.data) === stable(r.data);
}

/**
 * アカウントから読んだ一覧を、手元のそのアカウントのスコープに重ねる。
 * - 手元に無い → 足す（墓標も足す。あとで同じキーに書いたときの比べ先になる）
 * - 手元が送信待ち → アカウントの方が**新しいときだけ**置き換える（手元の書き換えは
 *   送ってもアカウント側で負ける）。そうでなければ手元のまま（送れば勝つ）
 * - 手元が送信済み → アカウントのものが正。違っていれば置き換える（アカウントが
 *   未来の時刻を丸めた場合も、これで揃う）
 * アカウントに無いキーは消さない（消すのは墓標だけ）。何も変わらなければ同じ map を
 * 返す（裏の読み直しのたびに画面を描き直さない）。
 */
export function applyPull(local: RecordMap, remote: readonly RemoteRecord[]): RecordMap {
  let next: Record<string, StoredRecord> | null = null;
  for (const r of remote) {
    const cur = local[r.key];
    let take: boolean;
    if (!cur) take = true;
    else if (cur.dirty) take = isNewer(r.updatedAt, cur.updatedAt);
    else take = !sameAsRemote(cur, r);
    if (!take) continue;
    next ??= { ...local };
    next[r.key] = r.deleted
      ? { kind: r.kind, data: {}, updatedAt: r.updatedAt, deleted: true }
      : { kind: r.kind, data: r.data, updatedAt: r.updatedAt };
  }
  return next ?? local;
}

/** 送信待ちの記録（送る形）。 */
export function dirtyRecords(map: RecordMap): RemoteRecord[] {
  const out: RemoteRecord[] = [];
  for (const [key, r] of Object.entries(map)) {
    if (!r.dirty) continue;
    out.push({
      key,
      kind: r.kind,
      data: r.deleted ? {} : r.data,
      deleted: !!r.deleted,
      updatedAt: r.updatedAt,
    });
  }
  return out;
}

/** 送れた記録の送信待ちを外す。送ってから書き換わった記録はそのまま（もう一度送る）。 */
export function markPushed(map: RecordMap, sent: readonly RemoteRecord[]): RecordMap {
  let next: Record<string, StoredRecord> | null = null;
  for (const s of sent) {
    const cur = map[s.key];
    if (!cur || !cur.dirty || cur.updatedAt !== s.updatedAt || !!cur.deleted !== s.deleted) {
      continue;
    }
    next ??= { ...map };
    const rest: StoredRecord = { ...cur };
    delete rest.dirty;
    next[s.key] = rest;
  }
  return next ?? map;
}

/** 送信待ちだけを残す（そのアカウントがこの端末からログアウトしたとき）。 */
export function pruneToDirty(map: RecordMap): RecordMap {
  const out: Record<string, StoredRecord> = {};
  for (const [key, r] of Object.entries(map)) if (r.dirty) out[key] = r;
  return out;
}

/**
 * 画面に出す記録。ログアウト中（`user` なし）は端末の分だけ。ログイン中は種類ごとに
 * （KIND_RULES）：`union` はアカウント ∪ 端末で新しい方、`account` はアカウントに
 * 値があればそれ。どちらも墓標は出さない。端末で「保存しない」と答えた記録も、
 * この端末では見せる。
 */
export function viewOf(user: RecordMap | undefined, anon: RecordMap | undefined): RecordMap {
  const u = user ?? EMPTY;
  const a = anon ?? EMPTY;
  const out: Record<string, StoredRecord> = {};
  for (const key of new Set([...Object.keys(u), ...Object.keys(a)])) {
    const x = u[key];
    const y = a[key];
    const kind = (x ?? y).kind;
    let pick: StoredRecord | undefined;
    if (!x) pick = y;
    else if (!y || KIND_RULES[kind]?.display === "account") pick = x;
    else pick = isNewer(y.updatedAt, x.updatedAt) ? y : x;
    if (pick && !pick.deleted) out[key] = pick;
  }
  return out;
}

/** 端末の記録が、アカウントの同じキーの版に負けていない（移す意味がある）。 */
function beats(a: StoredRecord, u: StoredRecord | undefined): boolean {
  return !u || isNewer(a.updatedAt, u.updatedAt);
}

/**
 * 「このアカウントに保存しますか？」の対象（尋ねる種類の、答えていない端末の記録で、
 * アカウントの版に負けていないもの）を種類ごとに数える。
 */
export function countAskable(
  user: RecordMap | undefined,
  anon: RecordMap | undefined
): Partial<Record<RecordKind, number>> {
  const out: Partial<Record<RecordKind, number>> = {};
  const u = user ?? EMPTY;
  for (const [key, a] of Object.entries(anon ?? EMPTY)) {
    if (a.localOnly || a.deleted || KIND_RULES[a.kind]?.adopt !== "ask") continue;
    if (!beats(a, u[key])) continue;
    out[a.kind] = (out[a.kind] ?? 0) + 1;
  }
  return out;
}

/**
 * 尋ねる種類の端末の記録をアカウントのスコープへ移す（「このアカウントに保存する」）。
 * 同じキーは新しい方を残す。「保存しない」と答えた記録と、尋ねない種類は端末に残す
 * （尋ねない種類は fillGaps が引き継ぐ）。墓標は捨てる。
 */
export function claimAnon(
  user: RecordMap,
  anon: RecordMap
): { user: RecordMap; anon: RecordMap } {
  const nextUser: Record<string, StoredRecord> = { ...user };
  const nextAnon: Record<string, StoredRecord> = {};
  for (const [key, a] of Object.entries(anon)) {
    if (a.deleted) continue;
    if (a.localOnly || KIND_RULES[a.kind]?.adopt !== "ask") {
      nextAnon[key] = a;
      continue;
    }
    if (beats(a, user[key])) {
      nextUser[key] = { kind: a.kind, data: a.data, updatedAt: a.updatedAt, dirty: true };
    }
  }
  return { user: nextUser, anon: nextAnon };
}

/** 尋ねる種類の端末の記録を「この端末だけ」にする（「保存しない」）。以後は尋ねない。 */
export function skipAnon(anon: RecordMap): RecordMap {
  let next: Record<string, StoredRecord> | null = null;
  for (const [key, a] of Object.entries(anon)) {
    if (a.localOnly || a.deleted || KIND_RULES[a.kind]?.adopt !== "ask") continue;
    next ??= { ...anon };
    next[key] = { ...a, localOnly: true };
  }
  return next ?? anon;
}

/**
 * 尋ねない種類（マイ星座・感コンディション・測定者）で、アカウントにまだ無いものを
 * 端末から引き継ぐ（アカウントの値・墓標は上書きしない）。引き継いだ端末の記録は
 * localOnly にして、次に別の人がこの端末でログインしても、もう引き継がない。
 * アカウントを読み終えてから呼ぶ（読む前だと「まだ無い」と取り違える）。
 */
export function fillGaps(
  user: RecordMap,
  anon: RecordMap
): { user: RecordMap; anon: RecordMap } {
  let nextUser: Record<string, StoredRecord> | null = null;
  let nextAnon: Record<string, StoredRecord> | null = null;
  for (const [key, a] of Object.entries(anon)) {
    if (a.localOnly || a.deleted || KIND_RULES[a.kind]?.adopt !== "auto") continue;
    if (!user[key]) {
      nextUser ??= { ...user };
      nextUser[key] = { kind: a.kind, data: a.data, updatedAt: a.updatedAt, dirty: true };
    }
    nextAnon ??= { ...anon };
    nextAnon[key] = { ...a, localOnly: true };
  }
  return { user: nextUser ?? user, anon: nextAnon ?? anon };
}

// ── キー ──

/** 振り返り：端末の日付キー（lib/day-records.ts の dayKeyOf。**月は 0 始まり**）→ "journal:YYYY-MM-DD"。 */
export function journalKey(dayKey: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dayKey);
  if (!m) return null;
  const month = Number(m[2]) + 1;
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `journal:${m[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "journal:YYYY-MM-DD" → 端末の日付キー（月は 0 始まり）。 */
export function dayKeyOfJournalKey(key: string): string | null {
  const m = /^journal:(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return `${Number(m[1])}-${Number(m[2]) - 1}-${Number(m[3])}`;
}

export const playbackKey = (id: string): string => `playback:${id}`;

export const SELF_RATING_KEY = "self_rating:latest";

export const ZODIAC_KEY = "setting:zodiac";

/** 測定者名の正規化（NFKC・前後の空白）。キーにも表示にもこれを使う。 */
export function normalizeSubjectName(name: string): string {
  return name.normalize("NFKC").trim();
}

/** 測定者は名前で1件（どの端末の「自分」も同じキーになる）。空の名前は null。 */
export function subjectKey(name: string): string | null {
  const n = normalizeSubjectName(name);
  if (!n || n.length > 100) return null;
  return `subject:${n}`;
}

export function keyKind(key: string): RecordKind | null {
  const kind = key.slice(0, key.indexOf(":"));
  return isRecordKind(kind) ? kind : null;
}
