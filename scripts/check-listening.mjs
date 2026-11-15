/**
 * `pnpm check:listening`：リスニング記録（lib/listening-record.ts）の自己点検。
 *
 * ホームの Sync Tree カードに出す「N日連続・N週連続」と「今日・今週の分」の決めごとを
 * 1つずつ確かめる：
 * - 聴いた日＝1分以上（59 秒は数えない・同じ日の2回は足す・いま鳴っている分も足す）
 * - 日の連続は今日まだなら昨日まで、2日空いたら 0
 * - 週は日曜はじまり。今週まだなら先週まで、1週空いたら 0
 * - 今週の分は日曜〜今日だけ（先週の土曜・今日より後の日付は入らない）
 * - 月・年の変わり目、夏時間の変わり目（America/New_York で 2026-11-01）をまたいでも数え違えない
 *
 * 記録の時刻は端末のローカル時刻で作る（new Date(年, 月, 日, 時).toISOString()）ので、
 * どのタイムゾーンで走らせても同じ結果になる。最後に TZ を替えてもう一度全部を通す。
 *
 * node 22 は .ts をそのまま import できる（check-records.mjs と同じ）。
 */
import assert from "node:assert/strict";
import {
  DAILY_GOAL_MIN,
  LISTENED_DAY_SEC,
  WEEKLY_GOAL_MIN,
  goalProgress,
  localDayKey,
  secondsByDay,
  summarizeListening,
  wholeMinutes,
} from "../lib/listening-record.ts";

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`✗ [${process.env.TZ ?? "local"}] ${name}`);
    throw err;
  }
}

/** ローカルの年・月（1始まり）・日・時に終わった、sec 秒の再生。 */
const log = (y, m, d, sec, h = 12) => ({ date: new Date(y, m - 1, d, h, 0, 0).toISOString(), duration: sec });
const summary = (logs, today, live = 0) => summarizeListening(secondsByDay(logs), today, live);
const MIN = 60;

function runAll() {
  // 2026-11-12 は木曜。今週＝11/8（日）〜11/14（土）、先週＝11/1〜11/7。
  const TODAY = "2026-11-12";

  check("目標の値（画面と説明に書いている数）", () => {
    assert.equal(DAILY_GOAL_MIN, 15);
    assert.equal(WEEKLY_GOAL_MIN, 100);
    assert.equal(LISTENED_DAY_SEC, 60);
  });

  check("記録が無ければ全部 0", () => {
    assert.deepEqual(summary([], TODAY), { dayStreak: 0, weekStreak: 0, todaySec: 0, weekSec: 0 });
  });

  check("日付キーはゼロ埋めのローカル暦日", () => {
    assert.equal(localDayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
    assert.equal(localDayKey(new Date(2026, 10, 12, 0, 0)), "2026-11-12");
  });

  check("今日だけ聴いた → 1日連続・1週連続", () => {
    const s = summary([log(2026, 11, 12, 15 * MIN)], TODAY);
    assert.equal(s.dayStreak, 1);
    assert.equal(s.weekStreak, 1);
    assert.equal(s.todaySec, 15 * MIN);
    assert.equal(s.weekSec, 15 * MIN);
  });

  check("今日まだ・昨日とおととい聴いた → 2日連続（今日が終わるまでは途切れない）", () => {
    const s = summary([log(2026, 11, 10, 5 * MIN), log(2026, 11, 11, 5 * MIN)], TODAY);
    assert.equal(s.dayStreak, 2);
    assert.equal(s.todaySec, 0);
  });

  check("今日も昨日も聴いていない → 0（さらに前に続いていても）", () => {
    const s = summary([log(2026, 11, 8, 20 * MIN), log(2026, 11, 9, 20 * MIN), log(2026, 11, 10, 20 * MIN)], TODAY);
    assert.equal(s.dayStreak, 0);
    // 週は今週聴いているので続いている
    assert.equal(s.weekStreak, 1);
  });

  check("途中に空いた日があれば、そこで止まる", () => {
    const s = summary(
      [log(2026, 11, 8, 10 * MIN), log(2026, 11, 10, 10 * MIN), log(2026, 11, 11, 10 * MIN), log(2026, 11, 12, 10 * MIN)],
      TODAY
    );
    assert.equal(s.dayStreak, 3);
  });

  check("59 秒の日は聴いた日に数えない（画面は 0 分）", () => {
    const s = summary([log(2026, 11, 11, 10 * MIN), log(2026, 11, 12, 59)], TODAY);
    assert.equal(s.dayStreak, 1, "今日は数えず、昨日の1日だけ");
    assert.equal(wholeMinutes(s.todaySec), 0);
  });

  check("同じ日の2回は足して数える（40 秒＋40 秒＝聴いた日）", () => {
    const s = summary([log(2026, 11, 12, 40, 9), log(2026, 11, 12, 40, 21)], TODAY);
    assert.equal(s.dayStreak, 1);
    assert.equal(s.todaySec, 80);
  });

  check("いま鳴っている再生の経過秒を今日・今週に足す", () => {
    const s = summary([log(2026, 11, 11, 10 * MIN), log(2026, 11, 12, 30)], TODAY, 45);
    assert.equal(s.todaySec, 75);
    assert.equal(s.dayStreak, 2, "30 秒＋いまの 45 秒で今日も聴いた日になる");
    assert.equal(s.weekSec, 10 * MIN + 75);
  });

  check("経過秒が数でなければ足さない", () => {
    assert.equal(summary([], TODAY, Number.NaN).todaySec, 0);
    assert.equal(summary([], TODAY, -5).todaySec, 0);
  });

  check("読めない記録（日付・秒数）は飛ばす", () => {
    const s = summary(
      [
        { date: "not a date", duration: 600 },
        { date: new Date(2026, 10, 12, 9).toISOString(), duration: Number.NaN },
        { date: new Date(2026, 10, 12, 10).toISOString(), duration: -30 },
        log(2026, 11, 12, 2 * MIN),
      ],
      TODAY
    );
    assert.equal(s.todaySec, 2 * MIN);
  });

  check("今週の分は日曜〜今日だけ（先週の土曜は入らない）", () => {
    const s = summary(
      [log(2026, 11, 7, 30 * MIN, 23), log(2026, 11, 8, 10 * MIN, 0), log(2026, 11, 12, 5 * MIN)],
      TODAY
    );
    assert.equal(s.weekSec, 15 * MIN);
    // 土曜→日曜→（月火水が空き）→木：日は1日、週は先週から続いて2週
    assert.equal(s.dayStreak, 1);
    assert.equal(s.weekStreak, 2);
  });

  check("今日より後の日付の記録（時計の進んだ端末）は数えない", () => {
    const s = summary([log(2026, 11, 13, 30 * MIN)], TODAY);
    assert.equal(s.weekSec, 0);
    assert.equal(s.todaySec, 0);
    assert.equal(s.dayStreak, 0);
    assert.equal(s.weekStreak, 0);
  });

  check("週の連続：今週・先週・先々週 → 3週", () => {
    const s = summary([log(2026, 10, 26, 5 * MIN), log(2026, 11, 3, 5 * MIN), log(2026, 11, 12, 5 * MIN)], TODAY);
    assert.equal(s.weekStreak, 3);
    assert.equal(s.dayStreak, 1);
  });

  check("週の連続：今週まだなら先週までを数える", () => {
    // 今日＝11/8（日）。今週はまだ。先週（11/1〜7）と先々週（10/25〜31）に聴いた
    const s = summary([log(2026, 10, 31, 5 * MIN), log(2026, 11, 2, 5 * MIN)], "2026-11-08");
    assert.equal(s.weekStreak, 2);
    assert.equal(s.dayStreak, 0);
  });

  check("週の連続：1週空いたら 0", () => {
    const s = summary([log(2026, 10, 26, 5 * MIN), log(2026, 10, 27, 5 * MIN)], TODAY);
    assert.equal(s.weekStreak, 0);
  });

  check("週の連続：1分未満の日しか無い週は数えない", () => {
    const s = summary([log(2026, 11, 3, 50), log(2026, 11, 5, 50), log(2026, 11, 12, 5 * MIN)], TODAY);
    assert.equal(s.weekStreak, 1);
  });

  check("月・年の変わり目をまたぐ", () => {
    const s = summary(
      [log(2025, 12, 30, 5 * MIN), log(2025, 12, 31, 5 * MIN), log(2026, 1, 1, 5 * MIN), log(2026, 1, 2, 5 * MIN)],
      "2026-01-02"
    );
    assert.equal(s.dayStreak, 4);
    // 2025-12-28（日）〜2026-01-03（土）が同じ週
    assert.equal(s.weekStreak, 1);
    assert.equal(s.weekSec, 20 * MIN);
  });

  check("夏時間の変わり目（2026-11-01）をまたぐ", () => {
    const s = summary(
      [log(2026, 10, 30, 5 * MIN, 23), log(2026, 10, 31, 5 * MIN, 0), log(2026, 11, 1, 5 * MIN, 1), log(2026, 11, 2, 5 * MIN, 0)],
      "2026-11-02"
    );
    assert.equal(s.dayStreak, 4);
    assert.equal(s.weekStreak, 2, "10/25〜31 の週と 11/1〜7 の週");
    assert.equal(s.weekSec, 10 * MIN);
  });

  check("長い連続（400 日）", () => {
    const logs = [];
    for (let i = 0; i < 400; i++) {
      const d = new Date(2026, 10, 12 - i, 8);
      logs.push({ date: d.toISOString(), duration: 15 * MIN });
    }
    const s = summary(logs, TODAY);
    assert.equal(s.dayStreak, 400);
    assert.ok(s.weekStreak >= 57 && s.weekStreak <= 59, `weekStreak=${s.weekStreak}`);
  });

  check("今日の日付が読めなければ全部 0", () => {
    assert.deepEqual(summary([log(2026, 11, 12, 600)], "11/12"), {
      dayStreak: 0,
      weekStreak: 0,
      todaySec: 0,
      weekSec: 0,
    });
  });

  check("分は切り捨て、帯は分から（帯と数字が食い違わない）", () => {
    assert.equal(wholeMinutes(59), 0);
    assert.equal(wholeMinutes(60), 1);
    assert.equal(wholeMinutes(899), 14);
    assert.equal(wholeMinutes(Number.NaN), 0);
    assert.equal(goalProgress(59, 15), 0);
    assert.equal(goalProgress(7.5 * MIN, 15), 7 / 15);
    assert.equal(goalProgress(30 * MIN, 15), 1, "目標を超えても 1 で止まる");
    assert.equal(goalProgress(600, 0), 0);
  });
}

// いまの TZ と、夏時間のある TZ・日本時間で通す（node は process.env.TZ の書き換えで
// Date のタイムゾーンを切り替える）。
for (const tz of [process.env.TZ, "America/New_York", "Asia/Tokyo", "Pacific/Auckland"]) {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
  runAll();
}

console.log(`✓ check:listening — ${passed} checks passed`);
