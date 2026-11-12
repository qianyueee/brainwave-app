// リスニング記録 — ホームの Sync Tree カードの「連続記録」と「リスニング目標」。
//
// 出どころは再生の記録（store/usePlaybackHistoryStore、1回の再生につき1件・聴いた秒数と
// 終わった時刻）。未ログインでも端末に残り、ログイン中はどの端末で聴いた分も同じ一覧に
// 並ぶ。Sync Tree のリスニング（ログイン中だけ・5分ごと・1日 15 分で頭打ち）とは別に、
// 聴いた分をそのまま数える。
//
// 決めごと：
// - 聴いた日＝その日に合わせて 1 分以上聴いた日。画面の分は切り捨てなので、「0 分」と
//   出ている日は数えない（数字と連続が食い違わない）。うっかり押して数秒で止めた日も
//   数えない
// - N日連続＝今日まで続けて聴いた日数。今日まだ聴いていなければ昨日までを数える——
//   今日が終わるまでは途切れない（朝に開いて「0日」と言われない）
// - N週連続＝聴いた日が1日でもある週が何週続いたか。週は日曜はじまり（ヒストリーの
//   カレンダーの行と同じ）。今週まだ聴いていなければ先週までを数える
// - 今日・今週の分＝その日・その週（日曜〜今日）に終わった再生の秒数の合計＋いま鳴って
//   いる再生の経過秒（記録はセッションを止めた・終わったときに書かれるので、聴いている
//   途中の分は足さないと増えていかない）
//
// 再生の記録の時刻は**終わった時刻**（components/AudioProvider.tsx の logPlayed）。夜中を
// またいで聴いた分は終わった日に入る。日付はこの端末のローカル暦日。
//
// 目標は固定（1日 15 分・1週間 100 分）：15 分はほとんどのプログラムの1回ぶん（星座・
// Target・Energy の既定の長さ）で、Sync Tree が1日に数えるリスニングの上限（5分×3）とも
// 同じ。100 分は毎日 15 分で1週間（105 分）——休んだ日があっても、20〜30 分の長めの
// プログラムを聴いた日があれば届く。
//
// このファイルは何も import しない——テストランナーが無いので、node で直接読み込んで
// 確かめる（`pnpm check:listening`）。

/** 1日の目標（分）。 */
export const DAILY_GOAL_MIN = 15;
/** 1週間（日曜〜土曜）の目標（分）。 */
export const WEEKLY_GOAL_MIN = 100;
/** その日を「聴いた日」と数える下限（秒）。 */
export const LISTENED_DAY_SEC = 60;

/** 再生の記録のうち、ここで読むところ（SessionLog と同じ形）。 */
export interface PlayedLog {
  /** 終わった時刻（ISO 8601） */
  date: string;
  /** 聴いた秒数 */
  duration: number;
}

/**
 * ローカル暦日 YYYY-MM-DD（lib/sync-tree.ts の treeDayKey と同じ形——ゼロ埋めなので
 * 文字列の大小がそのまま日付の前後になる）。
 */
export function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** YYYY-MM-DD → その日のローカル 0 時。形が違えば null。 */
function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * n 日ずらす。ミリ秒で 86400000 を足し引きしない——夏時間のある地域では1日が 23・25
 * 時間の日があり、0 時の前後で日付がずれる。
 */
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** その日を含む週の日曜。 */
function weekStartOf(d: Date): Date {
  return addDays(d, -d.getDay());
}

/** 日ごとに聴いた秒数（ローカル暦日 → 秒）。読めない記録は飛ばす。 */
export function secondsByDay(logs: readonly PlayedLog[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const log of logs) {
    const at = Date.parse(log.date);
    if (!Number.isFinite(at) || !Number.isFinite(log.duration) || log.duration <= 0) continue;
    const key = localDayKey(new Date(at));
    out.set(key, (out.get(key) ?? 0) + log.duration);
  }
  return out;
}

export interface ListeningSummary {
  /** 今日まで（今日まだなら昨日まで）続けて聴いた日数。途切れていれば 0 */
  dayStreak: number;
  /** 今週まで（今週まだなら先週まで）続けて聴いた週の数。途切れていれば 0 */
  weekStreak: number;
  /** 今日聴いた秒数（いまの再生を含む） */
  todaySec: number;
  /** 今週（日曜〜今日）聴いた秒数（いまの再生を含む） */
  weekSec: number;
}

const EMPTY_SUMMARY: ListeningSummary = { dayStreak: 0, weekStreak: 0, todaySec: 0, weekSec: 0 };

/**
 * 連続と今日・今週の分を出す。
 *
 * @param byDay  secondsByDay の結果
 * @param today  今日（ローカル暦日 YYYY-MM-DD）
 * @param liveSec いま鳴っている再生の経過秒（まだ記録になっていない分。無ければ 0）
 *
 * 今日より後の日付の記録（時計の進んだ別の端末が書いたもの）は数えない。その日が来たら
 * その日のぶんとして数える。
 */
export function summarizeListening(
  byDay: ReadonlyMap<string, number>,
  today: string,
  liveSec = 0
): ListeningSummary {
  const todayDate = parseDayKey(today);
  if (!todayDate) return EMPTY_SUMMARY;
  const live = Number.isFinite(liveSec) && liveSec > 0 ? liveSec : 0;
  const secOf = (key: string) => (byDay.get(key) ?? 0) + (key === today ? live : 0);
  const listened = (key: string) => secOf(key) >= LISTENED_DAY_SEC;

  // 日の連続。続く限り1日ずつさかのぼる（聴いた日の数だけしか回らない）。
  let day = listened(today) ? todayDate : addDays(todayDate, -1);
  let dayStreak = 0;
  while (listened(localDayKey(day))) {
    dayStreak += 1;
    day = addDays(day, -1);
  }

  // 週の連続。聴いた日がある週（の日曜）を集めて、今週から1週ずつさかのぼる。
  const listenedWeeks = new Set<string>();
  const markWeek = (key: string) => {
    const d = parseDayKey(key);
    if (d) listenedWeeks.add(localDayKey(weekStartOf(d)));
  };
  for (const key of byDay.keys()) {
    if (key <= today && listened(key)) markWeek(key);
  }
  if (listened(today)) markWeek(today);
  const thisWeek = weekStartOf(todayDate);
  let week = listenedWeeks.has(localDayKey(thisWeek)) ? thisWeek : addDays(thisWeek, -7);
  let weekStreak = 0;
  while (listenedWeeks.has(localDayKey(week))) {
    weekStreak += 1;
    week = addDays(week, -7);
  }

  // 今週（日曜〜今日）の合計。
  let weekSec = 0;
  for (let d = thisWeek; localDayKey(d) <= today; d = addDays(d, 1)) {
    weekSec += secOf(localDayKey(d));
  }

  return { dayStreak, weekStreak, todaySec: secOf(today), weekSec };
}

/** 画面に出す分（切り捨て）。 */
export function wholeMinutes(sec: number): number {
  return Number.isFinite(sec) && sec > 0 ? Math.floor(sec / 60) : 0;
}

/**
 * 目標に対する進み（0〜1）。画面に出す分（切り捨て）から出す——帯と数字が食い違わない
 * （59 秒は「0 分」で帯も空）。
 */
export function goalProgress(sec: number, goalMin: number): number {
  if (!(goalMin > 0)) return 0;
  return Math.min(1, wholeMinutes(sec) / goalMin);
}
