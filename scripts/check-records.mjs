/**
 * `pnpm check:records`：端末をまたぐ記録の合わせ方（lib/sync/record-merge.ts）の自己点検。
 *
 * テストランナーが無いので、ここで決まりごとを1つずつ確かめる：
 * - 書き換え・消去・読み直し・送信済みの印・「保存する／しない」・画面に出す一覧
 * - 日付キー（端末は月 0 始まり、アカウントは YYYY-MM-DD）の往復
 * - 2台の端末とアカウント（supabase/migrations/005_user_records.sql のトリガと同じ
 *   「新しい方が勝つ・未来の時刻は丸める」をメモリで再現）を行き来させ、オフラインの
 *   書き換え・時計のずれ・削除のあとで、どちらの端末も同じ内容に落ち着くこと
 *
 * node 22 は .ts をそのまま import できる（check-thinkgear.mjs と同じ）。
 */
import assert from "node:assert/strict";
import {
  EPOCH,
  applyPull,
  claimAnon,
  countAskable,
  dayKeyOfJournalKey,
  dirtyRecords,
  fillGaps,
  journalKey,
  markPushed,
  nextStamp,
  pruneToDirty,
  putRecord,
  removeRecord,
  skipAnon,
  subjectKey,
  viewOf,
} from "../lib/sync/record-merge.ts";

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const T = (s) => new Date(`2026-09-27T${s}Z`);
const iso = (s) => T(s).toISOString();

// ── 書く・時刻 ──

check("nextStamp: 時計が進んでいればいまの時刻", () => {
  assert.equal(nextStamp(T("10:00:00"), { kind: "journal", data: {}, updatedAt: iso("09:00:00") }), iso("10:00:00"));
});

check("nextStamp: 時計が遅れていても、見ていた版の 1ms 後（書き直しが負けない）", () => {
  const cur = { kind: "journal", data: {}, updatedAt: iso("12:00:00") };
  assert.equal(nextStamp(T("10:00:00"), cur), new Date(T("12:00:00").getTime() + 1).toISOString());
});

check("putRecord: アカウントのスコープでは送信待ちになる", () => {
  const m = putRecord({}, "journal:2026-09-27", "journal", { text: "a" }, { now: T("10:00:00"), dirty: true });
  assert.deepEqual(m["journal:2026-09-27"], {
    kind: "journal",
    data: { text: "a" },
    updatedAt: iso("10:00:00"),
    dirty: true,
  });
  const a = putRecord({}, "journal:2026-09-27", "journal", { text: "a" }, { now: T("10:00:00"), dirty: false });
  assert.equal(a["journal:2026-09-27"].dirty, undefined);
});

// ── 消す ──

check("removeRecord: anon はキーごと落とす（墓標は要らない）", () => {
  const m = { "setting:zodiac": { kind: "setting", data: { sign: "leo" }, updatedAt: iso("09:00:00") } };
  assert.deepEqual(removeRecord(m, "setting:zodiac", { now: T("10:00:00"), tombstone: false }), {});
});

check("removeRecord: アカウントは墓標を残して送る", () => {
  const m = { "setting:zodiac": { kind: "setting", data: { sign: "leo" }, updatedAt: iso("09:00:00") } };
  assert.deepEqual(removeRecord(m, "setting:zodiac", { now: T("10:00:00"), tombstone: true }), {
    "setting:zodiac": { kind: "setting", data: {}, updatedAt: iso("10:00:00"), deleted: true, dirty: true },
  });
});

check("removeRecord: 無いもの・消したものは同じ map のまま", () => {
  const m = { "x:1": { kind: "journal", data: {}, updatedAt: iso("09:00:00"), deleted: true } };
  assert.equal(removeRecord(m, "x:1", { now: T("10:00:00"), tombstone: true }), m);
  assert.equal(removeRecord(m, "nope", { now: T("10:00:00"), tombstone: true }), m);
});

// ── 読み直し ──

const remote = (key, data, at, deleted = false) => ({
  key,
  kind: key.slice(0, key.indexOf(":")),
  data,
  deleted,
  updatedAt: iso(at),
});

check("applyPull: 手元に無いものは足す（墓標も）", () => {
  const m = applyPull({}, [remote("journal:2026-09-27", { text: "a" }, "10:00:00"), remote("setting:zodiac", {}, "11:00:00", true)]);
  assert.deepEqual(m["journal:2026-09-27"], { kind: "journal", data: { text: "a" }, updatedAt: iso("10:00:00") });
  assert.equal(m["setting:zodiac"].deleted, true);
});

check("applyPull: 送信待ちの方が新しければ手元のまま（送れば勝つ）", () => {
  const local = { "journal:2026-09-27": { kind: "journal", data: { text: "mine" }, updatedAt: iso("12:00:00"), dirty: true } };
  assert.equal(applyPull(local, [remote("journal:2026-09-27", { text: "old" }, "11:00:00")]), local);
});

check("applyPull: 送信待ちでもアカウントの方が新しければ置き換える（送っても負ける）", () => {
  const local = { "journal:2026-09-27": { kind: "journal", data: { text: "mine" }, updatedAt: iso("10:00:00"), dirty: true } };
  const m = applyPull(local, [remote("journal:2026-09-27", { text: "newer" }, "11:00:00")]);
  assert.deepEqual(m["journal:2026-09-27"], { kind: "journal", data: { text: "newer" }, updatedAt: iso("11:00:00") });
});

check("applyPull: 送信済みはアカウントが正（丸められた時刻にも揃う）", () => {
  const local = { "setting:zodiac": { kind: "setting", data: { sign: "leo" }, updatedAt: iso("23:00:00") } };
  const m = applyPull(local, [remote("setting:zodiac", { sign: "leo" }, "10:05:00")]);
  assert.equal(m["setting:zodiac"].updatedAt, iso("10:05:00"));
});

check("applyPull: 同じ内容ならキーの並びが違っても同じ map（描き直さない）", () => {
  const local = { "journal:2026-09-27": { kind: "journal", data: { text: "a", mood: 3 }, updatedAt: iso("10:00:00") } };
  assert.equal(applyPull(local, [remote("journal:2026-09-27", { mood: 3, text: "a" }, "10:00:00")]), local);
});

// ── 送った印 ──

check("markPushed: 送ったときのままなら送信待ちを外す／その後書き換えたら残す", () => {
  let m = putRecord({}, "journal:2026-09-27", "journal", { text: "a" }, { now: T("10:00:00"), dirty: true });
  const sent = dirtyRecords(m);
  assert.equal(sent.length, 1);
  const edited = putRecord(m, "journal:2026-09-27", "journal", { text: "b" }, { now: T("10:00:05"), dirty: true });
  assert.equal(markPushed(edited, sent)["journal:2026-09-27"].dirty, true);
  m = markPushed(m, sent);
  assert.equal(m["journal:2026-09-27"].dirty, undefined);
  assert.equal(markPushed(m, sent), m);
});

check("dirtyRecords: 墓標は空の data・deleted=true で送る", () => {
  const m = removeRecord(
    { "subject:田中": { kind: "subject", data: { name: "田中" }, updatedAt: iso("09:00:00") } },
    "subject:田中",
    { now: T("10:00:00"), tombstone: true }
  );
  assert.deepEqual(dirtyRecords(m), [
    { key: "subject:田中", kind: "subject", data: {}, deleted: true, updatedAt: iso("10:00:00") },
  ]);
});

// ── 画面に出す一覧 ──

check("viewOf: 振り返り・測定者はアカウント ∪ 端末で新しい方、墓標は出さない", () => {
  const user = {
    "journal:2026-09-27": { kind: "journal", data: { text: "user" }, updatedAt: iso("10:00:00") },
    "subject:田中": { kind: "subject", data: {}, updatedAt: iso("12:00:00"), deleted: true },
  };
  const anon = {
    "journal:2026-09-27": { kind: "journal", data: { text: "anon" }, updatedAt: iso("11:00:00") },
    "subject:田中": { kind: "subject", data: { name: "田中" }, updatedAt: iso("11:00:00") },
    "subject:佐藤": { kind: "subject", data: { name: "佐藤" }, updatedAt: iso("09:00:00"), localOnly: true },
  };
  const v = viewOf(user, anon);
  assert.equal(v["journal:2026-09-27"].data.text, "anon");
  assert.equal(v["subject:田中"], undefined);
  assert.equal(v["subject:佐藤"].data.name, "佐藤");
  assert.deepEqual(Object.keys(viewOf(undefined, anon)).sort(), Object.keys(anon).sort());
});

check("viewOf: マイ星座・感コンディションはログイン中アカウントの値（端末の方が新しくても）", () => {
  const user = { "setting:zodiac": { kind: "setting", data: { sign: "virgo" }, updatedAt: iso("09:00:00") } };
  const anon = {
    "setting:zodiac": { kind: "setting", data: { sign: "leo" }, updatedAt: iso("11:00:00") },
    "self_rating:latest": { kind: "self_rating", data: { switching: 50 }, updatedAt: iso("11:00:00") },
  };
  const v = viewOf(user, anon);
  assert.equal(v["setting:zodiac"].data.sign, "virgo");
  // アカウントに値が無ければ端末の値
  assert.equal(v["self_rating:latest"].data.switching, 50);
  // ログアウト中は端末の値
  assert.equal(viewOf(undefined, anon)["setting:zodiac"].data.sign, "leo");
});

// ── 「保存する／しない」と、尋ねない種類の引き継ぎ ──

check("claimAnon: 尋ねる種類の答えていない記録だけ移し、負けている版・墓標は移さない", () => {
  const user = { "journal:2026-09-27": { kind: "journal", data: { text: "newer" }, updatedAt: iso("12:00:00") } };
  const anon = {
    "journal:2026-09-27": { kind: "journal", data: { text: "older" }, updatedAt: iso("10:00:00") },
    "playback:p1": { kind: "playback", data: { duration: 60 }, updatedAt: iso("09:00:00") },
    "playback:p2": { kind: "playback", data: { duration: 30 }, updatedAt: iso("09:00:00"), localOnly: true },
    "setting:zodiac": { kind: "setting", data: { sign: "leo" }, updatedAt: iso("09:00:00") },
    "subject:x": { kind: "subject", data: {}, updatedAt: iso("09:00:00"), deleted: true },
  };
  const r = claimAnon(user, anon);
  assert.equal(r.user["journal:2026-09-27"].data.text, "newer");
  assert.equal(r.user["journal:2026-09-27"].dirty, undefined);
  assert.deepEqual(r.user["playback:p1"], { kind: "playback", data: { duration: 60 }, updatedAt: iso("09:00:00"), dirty: true });
  assert.equal(r.user["setting:zodiac"], undefined);
  assert.deepEqual(Object.keys(r.anon).sort(), ["playback:p2", "setting:zodiac"]);
});

check("countAskable / skipAnon：尋ねる種類だけ・アカウントの新しい版に負けるものは数えない", () => {
  const user = { "journal:2026-09-26": { kind: "journal", data: {}, updatedAt: iso("12:00:00") } };
  const anon = {
    "playback:p1": { kind: "playback", data: {}, updatedAt: iso("09:00:00") },
    "playback:p2": { kind: "playback", data: {}, updatedAt: iso("09:00:00") },
    "journal:2026-09-27": { kind: "journal", data: {}, updatedAt: iso("09:00:00") },
    "journal:2026-09-26": { kind: "journal", data: {}, updatedAt: iso("09:00:00") },
    "setting:zodiac": { kind: "setting", data: { sign: "leo" }, updatedAt: iso("09:00:00") },
  };
  assert.deepEqual(countAskable(user, anon), { playback: 2, journal: 1 });
  const skipped = skipAnon(anon);
  assert.deepEqual(countAskable(user, skipped), {});
  assert.equal(skipped["setting:zodiac"].localOnly, undefined);
  assert.equal(skipAnon(skipped), skipped);
});

check("fillGaps: アカウントに無い設定・測定者だけ引き継ぎ、端末側は二度と引き継がない", () => {
  const user = {
    "setting:zodiac": { kind: "setting", data: { sign: "virgo" }, updatedAt: iso("08:00:00") },
    "subject:田中": { kind: "subject", data: {}, updatedAt: iso("08:00:00"), deleted: true },
  };
  const anon = {
    "setting:zodiac": { kind: "setting", data: { sign: "leo" }, updatedAt: iso("11:00:00") },
    "subject:田中": { kind: "subject", data: { name: "田中" }, updatedAt: iso("07:00:00") },
    "subject:自分": { kind: "subject", data: { name: "自分" }, updatedAt: EPOCH },
    "self_rating:latest": { kind: "self_rating", data: { switching: 50 }, updatedAt: iso("10:00:00") },
    "journal:2026-09-27": { kind: "journal", data: { text: "ask me" }, updatedAt: iso("10:00:00") },
  };
  const r = fillGaps(user, anon);
  assert.equal(r.user["setting:zodiac"].data.sign, "virgo"); // アカウントの値は上書きしない
  assert.equal(r.user["subject:田中"].deleted, true); // 消した測定者は戻さない
  assert.deepEqual(r.user["subject:自分"], { kind: "subject", data: { name: "自分" }, updatedAt: EPOCH, dirty: true });
  assert.equal(r.user["self_rating:latest"].dirty, true);
  assert.equal(r.user["journal:2026-09-27"], undefined); // 振り返りは尋ねる
  assert.equal(r.anon["setting:zodiac"].localOnly, true);
  assert.equal(r.anon["journal:2026-09-27"].localOnly, undefined);
  const again = fillGaps({}, r.anon);
  assert.equal(again.user["subject:自分"], undefined); // 次の人には引き継がない
});

check("pruneToDirty: ログアウトしたアカウントは送信待ちだけ端末に残す", () => {
  const m = {
    "journal:2026-09-27": { kind: "journal", data: {}, updatedAt: iso("10:00:00") },
    "playback:p1": { kind: "playback", data: {}, updatedAt: iso("10:00:00"), dirty: true },
  };
  assert.deepEqual(Object.keys(pruneToDirty(m)), ["playback:p1"]);
});

check("既定の「自分」（EPOCH）は、どの本当の書き換え・削除にも負ける", () => {
  const seeded = putRecord({}, "subject:自分", "subject", { name: "自分" }, { now: T("10:00:00"), dirty: true, at: EPOCH });
  assert.equal(seeded["subject:自分"].updatedAt, EPOCH);
  const pulled = applyPull(seeded, [remote("subject:自分", {}, "09:00:00", true)]);
  assert.equal(pulled["subject:自分"].deleted, true);
});

// ── キー ──

check("journalKey ⇄ dayKeyOfJournalKey（端末は月 0 始まり）", () => {
  assert.equal(journalKey("2026-0-5"), "journal:2026-01-05");
  assert.equal(journalKey("2026-11-31"), "journal:2026-12-31");
  assert.equal(journalKey("2026-8-27"), "journal:2026-09-27");
  assert.equal(dayKeyOfJournalKey("journal:2026-09-27"), "2026-8-27");
  assert.equal(dayKeyOfJournalKey("journal:2026-01-05"), "2026-0-5");
  for (const k of ["2026-8-27", "2026-0-1", "2026-11-31"]) {
    assert.equal(dayKeyOfJournalKey(journalKey(k)), k);
  }
  assert.equal(journalKey("2026-12-1"), null);
  assert.equal(journalKey("oops"), null);
  assert.equal(dayKeyOfJournalKey("journal:2026-9-27"), null);
});

check("subjectKey: NFKC・前後の空白を畳む、空は null", () => {
  assert.equal(subjectKey(" 田中 "), "subject:田中");
  assert.equal(subjectKey("ＡＢＣ"), "subject:ABC");
  assert.equal(subjectKey("   "), null);
});

// ── 2台の端末とアカウント ──

/** supabase/migrations/005 のトリガと同じ：古い書き込みは捨てる・未来は now+5分に丸める。 */
function makeServer(clock) {
  const rows = new Map();
  return {
    upsert(batch) {
      const cap = clock() + 5 * 60_000;
      for (const r of batch) {
        let at = Date.parse(r.updatedAt);
        if (at > cap) at = cap;
        const cur = rows.get(r.key);
        if (cur && at < Date.parse(cur.updatedAt)) continue;
        rows.set(r.key, { ...r, data: r.deleted ? {} : r.data, updatedAt: new Date(at).toISOString() });
      }
    },
    list() {
      return [...rows.values()].map((r) => ({ ...r }));
    },
  };
}

function makeDevice(offsetMs, clock) {
  return {
    map: {},
    now: () => new Date(clock() + offsetMs),
    put(key, data) {
      this.map = putRecord(this.map, key, key.slice(0, key.indexOf(":")), data, { now: this.now(), dirty: true });
    },
    remove(key) {
      this.map = removeRecord(this.map, key, { now: this.now(), tombstone: true });
    },
    sync(server) {
      const sent = dirtyRecords(this.map);
      server.upsert(sent);
      this.map = markPushed(this.map, sent);
      this.map = applyPull(this.map, server.list());
    },
    view() {
      return viewOf(this.map, undefined);
    },
  };
}

check("2台：書き換え・オフライン・削除・時計のずれのあとで同じ内容に落ち着く", () => {
  let t = T("10:00:00").getTime();
  const clock = () => t;
  const server = makeServer(clock);
  const a = makeDevice(0, clock);
  const b = makeDevice(-3 * 60_000, clock); // B は時計が3分遅れている
  const c = makeDevice(2 * 3600_000, clock); // C は2時間進んでいる

  a.put("journal:2026-09-27", { text: "A1", mood: 3 });
  a.sync(server);
  b.sync(server);
  assert.equal(b.view()["journal:2026-09-27"].data.text, "A1");

  // B（遅れた時計）が A1 を見てから書き直す → 見た版の後になり、勝つ。
  t += 60_000;
  b.put("journal:2026-09-27", { text: "B2", mood: 4 });
  b.sync(server);
  a.sync(server);
  assert.equal(a.view()["journal:2026-09-27"].data.text, "B2");

  // A はオフラインで再生の記録を2件、星座を設定。10分後に B が星座を別の値に。
  t += 60_000;
  a.put("playback:p1", { programId: "reset-deep", duration: 900 });
  a.put("playback:p2", { programId: "clarity-focus", duration: 1200 });
  a.put("setting:zodiac", { sign: "leo" });
  t += 10 * 60_000;
  b.put("setting:zodiac", { sign: "virgo" });
  b.sync(server);
  a.sync(server); // A が戻る：A の星座の方が古い → B の値に揃う
  b.sync(server);
  assert.equal(a.view()["setting:zodiac"].data.sign, "virgo");
  assert.equal(b.view()["playback:p2"].data.duration, 1200);

  // 互いを見ないまま時計のずれより短い間に書いた2つは、端末の時刻で決まる（実際の
  // 順番は分からないので、これがこの方式の限界。どちらかに揃うことだけを保証する）。
  t += 60_000;
  a.put("self_rating:latest", { switching: 10 });
  t += 60_000;
  b.put("self_rating:latest", { switching: 90 }); // 実際には後だが、B の時計では前
  a.sync(server);
  b.sync(server);
  a.sync(server);
  assert.equal(a.view()["self_rating:latest"].data.switching, 10);
  assert.equal(b.view()["self_rating:latest"].data.switching, 10);

  // A が振り返りを消す。B は消す前の版を持ったまま → 読み直すと消える（復活しない）。
  t += 60_000;
  a.remove("journal:2026-09-27");
  a.sync(server);
  b.sync(server);
  assert.equal(b.view()["journal:2026-09-27"], undefined);

  // 未来の時計の C が書く → アカウントは now+5分に丸め、C も丸めた版に揃う。
  c.sync(server);
  c.put("setting:zodiac", { sign: "aries" });
  c.sync(server);
  a.sync(server);
  assert.equal(a.view()["setting:zodiac"].data.sign, "aries");
  // 5分より後の本当の書き換えは C に勝てる（C がずっと勝ち続けない）。
  t += 10 * 60_000;
  a.put("setting:zodiac", { sign: "pisces" });
  a.sync(server);
  c.sync(server);
  b.sync(server);
  for (const d of [a, b, c]) assert.equal(d.view()["setting:zodiac"].data.sign, "pisces");

  // 最後に3台とも同じ一覧。
  const keysOf = (d) => JSON.stringify(Object.keys(d.view()).sort());
  assert.equal(keysOf(a), keysOf(b));
  assert.equal(keysOf(b), keysOf(c));
});

console.log(`check:records OK（${passed} 件）`);
