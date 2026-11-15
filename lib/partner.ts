/**
 * Sync Partner（ホームの話し相手：シンク彼女・シンク彼氏・シンクペット）の決まり。
 * **純関数・型以外 import しない**（`pnpm check:partner` が node で直接読む）。
 *
 * 返事を書くのは Edge Function `sync-partner`（supabase/functions/sync-partner）で、
 * ここにあるのは画面と関数が同じでなければならないもの：
 *
 *   - 役・気分・時間帯の語彙（関数の ROLES / MOODS / slotOf と同じ。check:partner が突き合わせる）
 *   - おすすめの候補を選ぶ決まり（partnerCandidates）——時間帯と気分で 1〜3 件。関数は
 *     この候補を AI に「まずここから」と渡し、AI が使えないとき（未ログイン・回数の上限・
 *     失敗）は画面が先頭の1件をそのまま出す（lib/partner-lines.ts の決まった台詞）
 *   - 関数へ送る形（PartnerInput / buildPartnerInput）。利用者が書いたひと言のほかは、
 *     決まった語彙と数だけ——プロンプトは関数が組む
 *   - つらい気持ちの言葉（looksLikeCrisis）。画面は送る前に確かめ、関数も確かめる
 *
 * 会話そのものは端末にその日（朝 5 時から翌朝 4:59 まで＝partnerDayKey）のぶんだけ残す
 * （store/usePartnerChatStore.ts）。関数も DB も会話を残さない。
 *
 * 形を変えたら関数の validateInput も同じに直し、両方の版（PARTNER_INPUT_VERSION /
 * INPUT_VERSION）を上げて `pnpm check:partner`。
 */

import type { Locale, LocalizedText } from "./i18n";
import type { ZodiacKey } from "./zodiac";

export const PARTNER_INPUT_VERSION = 1;

// ─── 役 ───────────────────────────────────────────────────────────────────────

export const PARTNER_ROLES = ["girlfriend", "boyfriend", "pet"] as const;
export type PartnerRole = (typeof PARTNER_ROLES)[number];

export function isPartnerRole(v: unknown): v is PartnerRole {
  return typeof v === "string" && (PARTNER_ROLES as readonly string[]).includes(v);
}

/** 役の名前（カードの見出し・選ぶ画面）。 */
export const ROLE_NAME: Record<PartnerRole, LocalizedText> = {
  girlfriend: { ja: "シンク彼女", en: "Sync Girlfriend" },
  boyfriend: { ja: "シンク彼氏", en: "Sync Boyfriend" },
  pet: { ja: "シンクペット", en: "Sync Pet" },
};

/** 選ぶ画面で名前の下に出すひと言。幅 360 でも1行に収まる長さにしてある。 */
export const ROLE_ABOUT: Record<PartnerRole, LocalizedText> = {
  girlfriend: { ja: "明るく世話好きな、やさしい存在", en: "Bright, caring and gentle" },
  boyfriend: { ja: "落ち着いて頼れる、聞き上手", en: "Calm, steady, a good listener" },
  pet: { ja: "無邪気で甘えんぼうな小さな相棒", en: "A playful little buddy" },
};

// ─── 時間帯 ───────────────────────────────────────────────────────────────────

/**
 * 時間帯は端末の時計で決める：朝 5:00〜11:59／午後 12:00〜17:59／帰宅後 18:00〜翌 4:59。
 * テーマの境目（6・12・18・0時）とは朝だけずらしてある——5時台に起きた人に
 * 「おかえり」とは言わない。
 */
export type PartnerSlot = "morning" | "afternoon" | "evening";

export function partnerSlot(hour: number): PartnerSlot {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/** 帰宅後のうち、眠る前の時間（22:00〜翌 4:59）。おすすめが眠りのプログラムに替わる。 */
export function isLateNight(hour: number): boolean {
  return hour >= 22 || hour < 5;
}

/**
 * 会話のひとまとまり：時間帯の「帰宅後」を 22 時で2つに分けたもの。替わると新しい挨拶から
 * 始まる（22 時を過ぎてカードを見ると、眠る前のおすすめに替わっている）。
 */
export type PartnerPhase = PartnerSlot | "lateNight";

export function partnerPhase(hour: number): PartnerPhase {
  const slot = partnerSlot(hour);
  return slot === "evening" && isLateNight(hour) ? "lateNight" : slot;
}

// ─── 気分 ─────────────────────────────────────────────────────────────────────

export const PARTNER_MOODS = ["energetic", "normal", "tired", "irritated", "sleepy", "focus"] as const;
export type PartnerMood = (typeof PARTNER_MOODS)[number];

export function isPartnerMood(v: unknown): v is PartnerMood {
  return typeof v === "string" && (PARTNER_MOODS as readonly string[]).includes(v);
}

/**
 * 気分のボタンの文字。押すとこの文字がそのまま利用者のひと言として会話に並び、
 * 関数は同じ言葉を AI に渡す（関数の MOOD_LABELS と同じ。check:partner が突き合わせる）。
 */
export const MOOD_LABEL: Record<PartnerMood, LocalizedText> = {
  energetic: { ja: "元気", en: "Energetic" },
  normal: { ja: "ふつう", en: "Okay" },
  tired: { ja: "疲れた", en: "Tired" },
  irritated: { ja: "イライラ", en: "Irritable" },
  sleepy: { ja: "眠い", en: "Sleepy" },
  focus: { ja: "集中したい", en: "Need focus" },
};

/** 「眠い」の続き：少し眠りたいのか、目を覚ましたいのか。 */
export const SLEEPY_CHOICES = ["nap", "wake"] as const;
export type SleepyChoice = (typeof SLEEPY_CHOICES)[number];

export const SLEEPY_LABEL: Record<SleepyChoice, LocalizedText> = {
  nap: { ja: "少し眠りたい", en: "A short nap" },
  wake: { ja: "目を覚ましたい", en: "Wake me up" },
};

const SLEEPY_PROGRAM: Record<SleepyChoice, string> = {
  nap: "target-afternoon-power-nap",
  wake: "morning-tuning",
};

export function sleepyProgramId(choice: SleepyChoice): string {
  return SLEEPY_PROGRAM[choice];
}

// ─── おすすめの候補 ───────────────────────────────────────────────────────────

/** 午後、気分ごとの候補（先頭がいちばんのおすすめ）。「ふつう」は今日の星のプログラムが先頭に入る。 */
const MOOD_PROGRAMS: Record<PartnerMood, readonly string[]> = {
  energetic: ["target-flow-state-deep-work", "target-creative-flow"],
  normal: ["reset-deep"],
  tired: ["target-brain-cleansing", "target-chronic-fatigue", "reset-deep"],
  irritated: ["target-autonomic-balance-vagus", "target-mental-quietness"],
  sleepy: [SLEEPY_PROGRAM.nap, SLEEPY_PROGRAM.wake],
  focus: ["clarity-focus", "target-high-speed-learning", "target-clarity-focus-work"],
};

/** 帰宅後（〜21:59）。平日は「退勤後」から、土日は仕事の話をしない並び。 */
const EVENING_WEEKDAY = ["target-post-work-decompression", "reset-deep", "target-brain-cleansing"] as const;
const EVENING_WEEKEND = ["reset-deep", "target-brain-cleansing", "target-mental-quietness"] as const;
/** 眠る前（22:00〜翌 4:59）。 */
const LATE_NIGHT = ["night-recovery", "target-deep-sleep-journey", "target-night-recovery-sleep"] as const;

export const PARTNER_CANDIDATES_MAX = 3;

/**
 * いまのおすすめの候補（プログラムの id、先頭がいちばんのおすすめ、最大 3 件）。
 *
 * - 朝：星空カードと同じ今日の星のプログラム（`skyProgramId`）→ モーニングチューニング。
 *   2枚のカードが別のものを勧めると、どちらを聴けばいいか分からなくなる
 * - 午後：気分で選ぶ。まだ聞いていなければ空（まず気分を尋ねる）
 * - 帰宅後：ゆるめるプログラム、22時からは眠りのプログラム
 */
export function partnerCandidates(args: {
  hour: number;
  /** 0＝日曜（Date#getDay）。 */
  weekday: number;
  mood: PartnerMood | null;
  /** 星空カードがいま勧めているプログラム（空を数える前・数えられなかったときは null）。 */
  skyProgramId: string | null;
}): string[] {
  const { hour, weekday, mood, skyProgramId } = args;
  const slot = partnerSlot(hour);
  let ids: readonly string[];
  if (slot === "morning") {
    ids = [...(skyProgramId ? [skyProgramId] : []), "morning-tuning"];
  } else if (slot === "afternoon") {
    if (mood === null) ids = [];
    else if (mood === "normal") ids = [...(skyProgramId ? [skyProgramId] : []), ...MOOD_PROGRAMS.normal];
    else ids = MOOD_PROGRAMS[mood];
  } else if (isLateNight(hour)) {
    ids = LATE_NIGHT;
  } else {
    ids = weekday === 0 || weekday === 6 ? EVENING_WEEKEND : EVENING_WEEKDAY;
  }
  return [...new Set(ids)].slice(0, PARTNER_CANDIDATES_MAX);
}

// ─── 関数へ送る形 ─────────────────────────────────────────────────────────────

/** 利用者の1通の長さ（文字）。関数の MAX_MESSAGE と同じ。 */
export const PARTNER_MESSAGE_MAX = 200;
/** 一緒に送るこれまでの会話の数と、1つの長さ。関数の MAX_HISTORY / MAX_HISTORY_TEXT と同じ。 */
export const PARTNER_HISTORY_MAX = 6;
export const PARTNER_HISTORY_TEXT_MAX = 400;
/** 1日に話せる回数（画面の案内に出す数。数えるのは関数＝DAILY_LIMIT と同じ）。 */
export const PARTNER_DAILY_LIMIT = 30;

export interface PartnerTurn {
  from: "partner" | "user";
  text: string;
}

/** 関数 `sync-partner` に送る本文。形は関数の validateInput と同じ（知らない項目は断られる）。 */
export interface PartnerInput {
  v: typeof PARTNER_INPUT_VERSION;
  locale: Locale;
  role: PartnerRole;
  /** 端末の時計。時間帯と挨拶は関数がここから決める。 */
  hour: number;
  minute: number;
  /** 0＝日曜。 */
  weekday: number;
  /** マイ星座（選んでいなければ null——星座の話はしない）。 */
  sign: ZodiacKey | null;
  /** 今日の空から決まった誘導ビート（星空カードと同じ判定）。数えられなかったら null。 */
  sky: { beat: number } | null;
  mood: PartnerMood | null;
  /** 聴いた習慣（N日連続・今日の分）。 */
  listening: { streakDays: number; todayMin: number } | null;
  candidates: string[];
  /** これまでの会話（古い順、最大 6）。 */
  history: PartnerTurn[];
  /** 利用者がいま書いたひと言。null＝開口一番のひと言を頼む。 */
  message: string | null;
}

/**
 * 文字の整え方（関数の text() と同じ）：改行などの制御文字は空白に、続く空白は1つに、
 * 前後は詰める。
 */
export function cleanPartnerText(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const clampInt = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : min;

export function buildPartnerInput(args: {
  locale: Locale;
  role: PartnerRole;
  now: Date;
  sign: ZodiacKey | null;
  skyBeat: number | null;
  mood: PartnerMood | null;
  listening: { streakDays: number; todayMin: number } | null;
  candidates: readonly string[];
  history: readonly PartnerTurn[];
  message: string | null;
}): PartnerInput {
  const history: PartnerTurn[] = [];
  for (const turn of args.history.slice(-PARTNER_HISTORY_MAX)) {
    const text = cleanPartnerText(turn.text).slice(0, PARTNER_HISTORY_TEXT_MAX);
    if (text) history.push({ from: turn.from, text });
  }
  const message = args.message === null ? null : cleanPartnerText(args.message).slice(0, PARTNER_MESSAGE_MAX);
  return {
    v: PARTNER_INPUT_VERSION,
    locale: args.locale,
    role: args.role,
    hour: args.now.getHours(),
    minute: args.now.getMinutes(),
    weekday: args.now.getDay(),
    sign: args.sign,
    sky: args.skyBeat === null ? null : { beat: args.skyBeat },
    mood: args.mood,
    listening: args.listening
      ? {
          streakDays: clampInt(args.listening.streakDays, 0, 9999),
          todayMin: clampInt(args.listening.todayMin, 0, 1440),
        }
      : null,
    candidates: [...new Set(args.candidates)].slice(0, PARTNER_CANDIDATES_MAX),
    history,
    // 空のひと言は呼び出し側が送らない（関数は空の文字を断る）。
    message,
  };
}

// ─── 日付 ─────────────────────────────────────────────────────────────────────

/** 端末の暦日（YYYY-MM-DD）。1日の回数を使い切った日の印に使う（関数は日本時間の暦日で数える）。 */
export function calendarDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 会話を残す1日：朝 5:00 から翌朝 4:59 まで。端末にはこの1日のぶんだけ残す。暦日で
 * 区切らないのは、帰宅後の会話（〜翌 4:59）が真夜中に消えないように。5 時間前の暦日を
 * 年・月・日・時から組み直して求める（ミリ秒を引くと夏時間の日に1時間ずれる）。
 */
export function partnerDayKey(d: Date): string {
  return calendarDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() - 5, d.getMinutes()));
}

// ─── つらい気持ちを打ち明けられたとき ──────────────────────────────────────────
//
// 「死にたい」などはっきりした言葉には、AI に渡さずに決まった文（lib/partner-lines.ts の
// CARE_LINE）で答える。画面は送る前にここで確かめる——通信できないとき・回数を使い切った
// ときも同じ返事になり、その言葉は端末から出ない。関数（looksLikeCrisis・CARE_REPLY）も
// 同じものを持つ（古い画面・ほかの呼び手のため）。2つは check:partner が突き合わせる。
// 慣用句の「死ぬほど疲れた」は拾わない。

const CRISIS_PATTERNS: readonly RegExp[] = [
  /死にた[いくか]|しにたい|シニタイ|死んでしまいたい|死のうと|死んだ(方|ほう)が(まし|楽|いい)|消えてしまいたい|消えたい|消えたくな|消えたくて|キエタイ|いなくなりたい|自殺|じさつ|生きていたくない|生きてたくない|生きるのがつら|生きるのが辛|生きてる意味|生きている意味|自分を傷つけ|リストカット|リスカ|首を吊|飛び降りた[いく]|飛び降りよう/,
  /\b(kill(ing)? myself|suicid\w*|(want|wish) to die|wanna die|end(ing)? my life|end it all|hurt(ing)? myself|harm(ing)? myself|self[- ]harm\w*|no reason to live|better off dead|wish i (was|were) dead|(don't|do not|dont) want to (live|be alive))\b/i,
];

export function looksLikeCrisis(message: string): boolean {
  // 全角・半角カナは NFKC でそろえ、曲がったアポストロフィ（don’t）はまっすぐに。
  const s = message.normalize("NFKC").replace(/[‘’]/g, "'");
  return CRISIS_PATTERNS.some((p) => p.test(s));
}
