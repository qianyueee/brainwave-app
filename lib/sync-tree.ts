// Sync Tree — 育樹の成長モデル（16段階）。
//
// 木の「状態」は保存しない。アカウントには出来事（水やり・リスニング・植え替え）
// を1件1行で残し（supabase/migrations/004_sync_tree.sql）、画面は毎回それを
// foldTreeEvents で畳んで「いまの木」と「育てた木」を出す。
//
// ルール（プロダクトで確定）：
// - 水やり（/tree で木をダブルタップ）… 1日1回 +1
// - プログラムを聴く … 5分ごとに +2、1日 +5 まで（2+2+1）→ 水やりと合わせて 1日最大 +6
// - 13 ポイントで次の段階。16段階なので大樹（16）は 15×13 = 195
// - 大樹からさらに 7（計 202）で完成。「新しい木を育てる」を選ぶと育てた木が1本
//   増え、次の木は 0 から
//
// 1日の上限はデータの形でも守る：水やりの id は日付で決め打ち（water:YYYY-MM-DD）
// なので、別の端末で同じ日に水をやっても1行にしかならない。リスニングは端末ごとに
// 聴いた分がどれも残るよう id に乱数を入れ（固定の枠番号だと、後から届いた方が
// 「重複」として捨てられる）、上限はここで数える——その日の時刻順で最初の3件が
// +2・+2・+1、4件目からは 0。
//
// 点数は行に持たせずここで決める。定数を変えると過去の木も新しいルールで数え直され
// （育てた木の本数まで変わりうる）ので、ルールを変えるときはそのつもりで。
//
// **数値は画面に出さない**（プロダクト判断）：％・ポイント・「+1」のような加算量は
// ここの内部だけで使い、画面は段階名と、growthLevel でぼかした言葉・目盛りの無い帯で
// 育ち具合を伝える。画面に出る数字は育てた木の本数と、「1日1回」「5分」の使い方だけ。
//
// このファイルは何も import しない——テストランナーが無いので、node で直接
// 読み込んで確かめられるようにしてある。

/** 1本の木を構成する段階数。 */
export const TREE_STAGE_COUNT = 16;
/** 次の段階までのポイント。 */
export const POINTS_PER_STAGE = 13;
/** 大樹になってから完成までのポイント。 */
export const MATURE_POINTS = 7;
/** 大樹（最終段階）に届くポイント（195）。 */
export const BIG_TREE_AT = (TREE_STAGE_COUNT - 1) * POINTS_PER_STAGE;
/** 完成＝植え替えられるようになるポイント（202）。 */
export const TREE_COMPLETE_AT = BIG_TREE_AT + MATURE_POINTS;

/** 水やり1回（1日1回）。 */
export const WATER_POINTS = 1;
/** リスニングを1回ぶんと数える長さ（秒）。 */
export const LISTEN_BLOCK_SEC = 5 * 60;
/** その日の n 件目のリスニングが何ポイントか。これより後は 0（1日 +5）。 */
export const LISTEN_SLOT_POINTS: readonly number[] = [2, 2, 1];

export interface TreeStage {
  /** 段階番号（1始まり、01〜16） */
  num: number;
  /** 段階名（星の種 → 大樹） */
  name: string;
  /** 段階名の英語（Star Seed → Great Tree） */
  nameEn: string;
  /** 属する成長期 */
  phase: string;
}

/** 6つの成長期 × 16段階。並びはデザインハンドオフの表のまま。 */
export const TREE_STAGES: TreeStage[] = [
  { num: 1, name: "星の種", nameEn: "Star Seed", phase: "種期" },
  { num: 2, name: "発芽", nameEn: "Sprout", phase: "種期" },
  { num: 3, name: "双葉", nameEn: "First Leaves", phase: "種期" },
  { num: 4, name: "本葉", nameEn: "True Leaves", phase: "苗期" },
  { num: 5, name: "苗立ち", nameEn: "Seedling", phase: "苗期" },
  { num: 6, name: "若苗", nameEn: "Young Seedling", phase: "苗期" },
  { num: 7, name: "幼木", nameEn: "Sapling", phase: "幼木期" },
  { num: 8, name: "枝分かれ", nameEn: "Branching Out", phase: "幼木期" },
  { num: 9, name: "葉茂り", nameEn: "Leafing Out", phase: "幼木期" },
  { num: 10, name: "若木", nameEn: "Young Tree", phase: "若木期" },
  { num: 11, name: "枝張り", nameEn: "Spreading Branches", phase: "若木期" },
  { num: 12, name: "樹冠形成", nameEn: "Crown Forming", phase: "若木期" },
  { num: 13, name: "成木", nameEn: "Mature Tree", phase: "成木期" },
  { num: 14, name: "開花", nameEn: "Blossoming", phase: "成木期" },
  { num: 15, name: "結実", nameEn: "Bearing Fruit", phase: "成木期" },
  { num: 16, name: "大樹", nameEn: "Great Tree", phase: "大樹" },
];

/** 画面に出す段階名（lib/i18n.ts の Locale と同じ値。ここは import を持たない）。 */
export function treeStageName(stage: TreeStage, locale: "ja" | "en"): string {
  return locale === "en" ? stage.nameEn : stage.name;
}

// ── 出来事 ──

export type TreeEventKind = "water" | "listen" | "replant";

export function isTreeEventKind(v: unknown): v is TreeEventKind {
  return v === "water" || v === "listen" || v === "replant";
}

export interface TreeEvent {
  /** 行のキー（user_id と組で主キー）。water:日付 / listen:日付:乱数 / replant:日付 */
  id: string;
  kind: TreeEventKind;
  /** その出来事を数えるローカル暦日 YYYY-MM-DD。 */
  day: string;
  /**
   * 起きた時刻（ISO 8601）。並べ替えは Date.parse で——端末で作った行は `…Z`、
   * DB から読み戻した行は `…+00:00` で、文字列のままだと順番を取り違える。
   */
  occurredAt: string;
}

/**
 * ローカル暦日の YYYY-MM-DD。DB の date 列とそのまま突き合わせられる形。
 * lib/day-records.ts の dayKeyOf（0始まり・ゼロ埋め無しの月）とは別物。
 */
export function treeDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export const waterEventId = (day: string): string => `water:${day}`;
export const replantEventId = (day: string): string => `replant:${day}`;
export const listenEventId = (day: string, nonce: string): string => `listen:${day}:${nonce}`;

// ── 畳む ──

export interface TreeRecord {
  /** 何本目か（1 始まり） */
  index: number;
  /** 完成日（202 に届いた日） YYYY-MM-DD */
  completedAt: string;
}

export interface TreeFold {
  /** 育てている木のポイント（0〜TREE_COMPLETE_AT） */
  points: number;
  /** 植え替えで記録した木（古い順）。本数＝育てた木 */
  completed: TreeRecord[];
}

function eventTime(e: TreeEvent): number {
  const t = Date.parse(e.occurredAt);
  return Number.isFinite(t) ? t : 0;
}

/** 起きた順（同時刻は id 順——どの端末で畳んでも同じ順になるように）。 */
export function sortTreeEvents(events: readonly TreeEvent[]): TreeEvent[] {
  return [...events].sort(
    (a, b) => eventTime(a) - eventTime(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * 出来事を起きた順に積み上げて、いまの木と育てた木を出す。
 *
 * - 202 で頭打ち。届いた日を完成日として覚えておく
 * - 植え替えは 202 に届いているときだけ数える（育てた木に1本積んで 0 に戻す）
 * - リスニングはその日の n 件目が LISTEN_SLOT_POINTS[n]（4件目からは 0）
 */
export function foldTreeEvents(events: readonly TreeEvent[]): TreeFold {
  let points = 0;
  let completeDay: string | null = null;
  const completed: TreeRecord[] = [];
  const wateredDays = new Set<string>();
  const listensByDay = new Map<string, number>();

  const add = (gain: number, day: string) => {
    if (gain <= 0 || points >= TREE_COMPLETE_AT) return;
    points = Math.min(TREE_COMPLETE_AT, points + gain);
    if (points >= TREE_COMPLETE_AT) completeDay = day;
  };

  for (const e of sortTreeEvents(events)) {
    if (e.kind === "water") {
      // id が日付で決まるので本来1日1件。念のためここでも二度は数えない。
      if (wateredDays.has(e.day)) continue;
      wateredDays.add(e.day);
      add(WATER_POINTS, e.day);
    } else if (e.kind === "listen") {
      const n = listensByDay.get(e.day) ?? 0;
      listensByDay.set(e.day, n + 1);
      add(LISTEN_SLOT_POINTS[n] ?? 0, e.day);
    } else if (e.kind === "replant") {
      if (points < TREE_COMPLETE_AT) continue;
      completed.push({ index: completed.length + 1, completedAt: completeDay ?? e.day });
      points = 0;
      completeDay = null;
    }
  }
  return { points, completed };
}

// ── 表示用 ──

function clampPoints(points: number): number {
  if (!Number.isFinite(points)) return 0;
  return Math.max(0, Math.min(TREE_COMPLETE_AT, Math.floor(points)));
}

/** ポイント → 0始まりの段階インデックス（0〜15）。 */
export function treeStageIndex(points: number): number {
  return Math.min(TREE_STAGE_COUNT - 1, Math.floor(clampPoints(points) / POINTS_PER_STAGE));
}

export function treeStage(points: number): TreeStage {
  return TREE_STAGES[treeStageIndex(points)];
}

export function isTreeComplete(points: number): boolean {
  return clampPoints(points) >= TREE_COMPLETE_AT;
}

export interface StageProgress {
  /** growing＝次の段階へ / maturing＝大樹から完成へ / complete＝植え替えを待っている */
  phase: "growing" | "maturing" | "complete";
  /** いまの区間で積んだポイント */
  filled: number;
  /** 区間の大きさ（growing は 13、maturing・complete は 7） */
  size: number;
  /** 区間の終わりまで（complete は 0） */
  remaining: number;
}

export function stageProgress(points: number): StageProgress {
  const p = clampPoints(points);
  if (p >= TREE_COMPLETE_AT) {
    return { phase: "complete", filled: MATURE_POINTS, size: MATURE_POINTS, remaining: 0 };
  }
  if (p >= BIG_TREE_AT) {
    const filled = p - BIG_TREE_AT;
    return { phase: "maturing", filled, size: MATURE_POINTS, remaining: MATURE_POINTS - filled };
  }
  const filled = p % POINTS_PER_STAGE;
  return { phase: "growing", filled, size: POINTS_PER_STAGE, remaining: POINTS_PER_STAGE - filled };
}

/**
 * いまの区間（次の段階まで／大樹から完成まで）がどこまで進んだかを3つにぼかす。
 * 画面は数値の代わりにこれで言葉を選ぶ（「育ちはじめました」「すくすく」「もうすぐ」）。
 * 完成（植え替え待ち）は near。
 */
export type GrowthLevel = "early" | "middle" | "near";

export function growthLevel(points: number): GrowthLevel {
  const { filled, size } = stageProgress(points);
  const ratio = filled / size;
  if (ratio < 1 / 3) return "early";
  if (ratio < 2 / 3) return "middle";
  return "near";
}

export interface TreeDayStatus {
  /** その日に水やりした */
  watered: boolean;
  /** その日のリスニングの件数（上限を超えた分も含む） */
  listenCount: number;
  /** その日のリスニングの枠で得たポイント（0〜5） */
  listenPoints: number;
  /** その日のリスニングの枠を使い切った */
  listenCapped: boolean;
}

export function treeDayStatus(events: readonly TreeEvent[], day: string): TreeDayStatus {
  let watered = false;
  let listenCount = 0;
  for (const e of events) {
    if (e.day !== day) continue;
    if (e.kind === "water") watered = true;
    else if (e.kind === "listen") listenCount += 1;
  }
  const listenPoints = LISTEN_SLOT_POINTS.slice(0, listenCount).reduce((a, b) => a + b, 0);
  return {
    watered,
    listenCount,
    listenPoints,
    listenCapped: listenCount >= LISTEN_SLOT_POINTS.length,
  };
}

/** 「7/2」形式。記録カードの一覧用。 */
export function formatTreeDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

// ── リスニングの積算 ──
//
// 再生中の経過秒（useAppStore の elapsed、AudioProvider が1秒ごとに書く）を見て、
// 5分たまるごとに1回ぶん（blocks）を返す。副作用は持たない——購読と加算は
// lib/sync/tree-runtime.ts、上限の判定はストアの役目。

export interface ListenTracker {
  /** いま数えている再生の番組 id（再生していなければ null） */
  programId: string | null;
  /** 直前に見た経過秒 */
  lastElapsed: number;
  /** 5分に満たない端数（秒） */
  carrySec: number;
  /** 端数を積み始めた再生の日（YYYY-MM-DD） */
  day: string | null;
  /** 端数の持ち主（ログイン中のユーザー id） */
  owner: string | null;
}

export const LISTEN_TRACKER_START: ListenTracker = {
  programId: null,
  lastElapsed: 0,
  carrySec: 0,
  day: null,
  owner: null,
};

export interface ListenSample {
  /** 鳴っている番組（タイムラインのプレビューや素のシンセは null） */
  programId: string | null;
  /** その再生の経過秒 */
  elapsed: number;
  /**
   * その再生の記録（sessionLogs）がいま届いたなら、その秒数。終わりのタイマーは
   * 最後の1秒ポーリングより先に鳴るので、elapsed は満了の手前で 0 に戻される
   * ——5分の番組が 299 秒どまりで1回ぶんにならない。記録の秒数で締める。
   */
  loggedSec?: number;
  /** いまのローカル暦日 */
  day: string;
  /** ログイン中のユーザー（未ログインは null） */
  owner: string | null;
  /** いま数えてよいか（その人の木を読み込み済み・完成していない・今日の枠が残っている） */
  eligible: boolean;
}

/**
 * 1サンプルぶん進める。
 *
 * - 新しい再生の最初のサンプルは起点（それより前の秒は数えない）。新しい再生が
 *   前と別の日に始まったら端数は捨てる（夜中をまたいで聴き続けた分は持ち越す）
 * - 経過秒が戻ったら（巻き戻し・再生し直し）その差は数えない
 * - 数えてよくない間（未ログイン・読み込み中・完成・今日の枠が満杯）は積まない
 * - 持ち主が替わったら端数を捨てる（前の人の聴いた分を次の人に回さない）
 * - バックグラウンドで経過秒が大きく跳んでも、鳴っていた時間なのでそのまま数える
 *   （何回ぶんになっても、ストアが1日の上限で止める）
 */
export function trackListening(
  tracker: ListenTracker,
  sample: ListenSample
): { tracker: ListenTracker; blocks: number } {
  let { carrySec, day } = tracker;
  if (sample.owner !== tracker.owner) {
    carrySec = 0;
    day = null;
  }

  if (sample.programId === null) {
    return {
      tracker: { programId: null, lastElapsed: 0, carrySec, day, owner: sample.owner },
      blocks: 0,
    };
  }

  const elapsed = Math.max(
    Number.isFinite(sample.elapsed) ? sample.elapsed : 0,
    sample.loggedSec ?? 0
  );

  if (sample.programId !== tracker.programId) {
    if (day !== sample.day) {
      carrySec = 0;
      day = sample.day;
    }
    return {
      tracker: { programId: sample.programId, lastElapsed: elapsed, carrySec, day, owner: sample.owner },
      blocks: 0,
    };
  }

  const delta = elapsed - tracker.lastElapsed;
  const next: ListenTracker = {
    programId: sample.programId,
    lastElapsed: elapsed,
    carrySec,
    day,
    owner: sample.owner,
  };
  if (!sample.eligible || !(delta > 0)) return { tracker: next, blocks: 0 };

  const total = carrySec + delta;
  const blocks = Math.floor(total / LISTEN_BLOCK_SEC);
  next.carrySec = total - blocks * LISTEN_BLOCK_SEC;
  return { tracker: next, blocks };
}
