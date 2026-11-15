/**
 * Sync Partner の決まった台詞（AI を使えないとき）。**純関数・型以外 import しない**
 * （`pnpm check:partner` が node で直接読む）。
 *
 * ふだんの返事は Edge Function `sync-partner` が AI に書かせる。ここの台詞を使うのは：
 *   - ログインしていないとき（関数はログインが要る）
 *   - その日の回数（30 回）を使い切ったとき
 *   - 関数がまだ無い・返事が届かない・読めないとき
 * 台詞は役ごと・言語ごとに1つずつ。`{p}` はプログラムの名前（日本語は『』、英語は ""
 * で囲む）。口調は関数の役の設定（PERSONAS）に合わせてある——一人称（わたし／僕／ボク）は
 * 台詞に出さない。
 */

import type { Locale, LocalizedText } from "./i18n";
import type { PartnerMood, PartnerPhase, PartnerRole, SleepyChoice } from "./partner";

export type FixedLineKind =
  | "morning"
  | "afternoon"
  | "evening"
  | "lateNight"
  | "energetic"
  | "normal"
  | "tired"
  | "irritated"
  | "focus"
  | "sleepyAsk"
  | "sleepyNap"
  | "sleepyWake"
  | "another"
  | "noMore"
  | "thanks"
  | "sorry"
  | "capped";

/** プログラムを勧める（`{p}` が入る）台詞。 */
export const LINES_WITH_PROGRAM: readonly FixedLineKind[] = [
  "morning",
  "evening",
  "lateNight",
  "energetic",
  "normal",
  "tired",
  "irritated",
  "focus",
  "sleepyNap",
  "sleepyWake",
  "another",
];

export const FIXED_LINES: Record<PartnerRole, Record<FixedLineKind, LocalizedText>> = {
  girlfriend: {
    morning: {
      ja: "おはよう。よく眠れた？ 今日は{p}から始めてみない？",
      en: "Good morning. Did you sleep well? How about starting today with {p}?",
    },
    afternoon: {
      ja: "こんにちは。午後もおつかれさま。いま、どんな気分？",
      en: "Hi there. You're doing great this afternoon. How are you feeling right now?",
    },
    evening: {
      ja: "おかえりなさい。今日も一日おつかれさま。{p}で、ゆっくりしよっか。",
      en: "Welcome back. You made it through another day. Shall we unwind with {p}?",
    },
    lateNight: {
      ja: "遅くまでおつかれさま。眠る前に{p}を聴いて、ゆっくり休もうね。",
      en: "It's getting late. Shall we listen to {p} and get some good rest?",
    },
    energetic: {
      ja: "元気なんだね、うれしいな。その調子で{p}を聴いてみない？",
      en: "You're full of energy. That makes me happy. How about {p} to keep it going?",
    },
    normal: {
      ja: "ふつうの日も大事だよね。{p}で、もう少し整えておこっか。",
      en: "An ordinary day matters too. Shall we tune up a little with {p}?",
    },
    tired: {
      ja: "がんばってるもんね。{p}で、少しだけ休もう？",
      en: "You've been working hard. Shall we rest for a bit with {p}?",
    },
    irritated: {
      ja: "そういう時もあるよね。{p}で、気持ちをほどいてみよっか。",
      en: "Those days happen. Shall we loosen things up with {p}?",
    },
    focus: {
      ja: "集中したいんだね。{p}で、頭を切り替えよっか。",
      en: "You want to focus. Shall we switch your head on with {p}?",
    },
    sleepyAsk: {
      ja: "眠いんだね。少し眠りたい？ それとも目を覚ましたい？",
      en: "Sleepy, huh? Would you like a short nap, or would you rather wake up?",
    },
    sleepyNap: { ja: "じゃあ{p}で、少しだけ休もうね。", en: "Then let's take a short rest with {p}." },
    sleepyWake: { ja: "じゃあ{p}で、すっきり目を覚まそっか。", en: "Then let's wake you up gently with {p}." },
    another: { ja: "それなら{p}はどうかな？", en: "Then how about {p}?" },
    noMore: {
      ja: "いまのおすすめはこのくらいかな。気になったものを聴いてみてね。",
      en: "That's all I have for now. Try whichever one caught your eye.",
    },
    thanks: { ja: "どういたしまして。いつでも声をかけてね。", en: "You're welcome. Talk to me anytime." },
    sorry: {
      ja: "ごめんね、いまうまくお返事できないみたい。少ししたら、また話しかけてね。",
      en: "Sorry, I can't seem to answer right now. Try talking to me again in a little while.",
    },
    capped: {
      ja: "今日はたくさん話したね。続きはまた明日にしよう。",
      en: "We talked a lot today. Let's pick this up again tomorrow.",
    },
  },
  boyfriend: {
    morning: {
      ja: "おはよう。今日は{p}で、ゆっくり一日を始めようか。",
      en: "Good morning. Let's start the day slowly with {p}.",
    },
    afternoon: {
      ja: "こんにちは。午後もよくがんばってるね。いま、どんな気分？",
      en: "Hi. You're doing well this afternoon. How are you feeling right now?",
    },
    evening: {
      ja: "おかえり。今日も一日おつかれさま。{p}で、ゆっくり呼吸を整えようか。",
      en: "Welcome back. You made it through another day. Let's slow your breathing down with {p}.",
    },
    lateNight: {
      ja: "遅くまでおつかれさま。眠る前に{p}を聴いて、今日はもう休もう。",
      en: "It's late. Listen to {p} before bed, and let's call it a day.",
    },
    energetic: {
      ja: "調子がいいみたいだね。その勢いで{p}を聴いてみようか。",
      en: "Sounds like you're in good shape. Let's keep it going with {p}.",
    },
    normal: {
      ja: "落ち着いているのはいいことだね。{p}で、もう少し整えようか。",
      en: "Steady is good. Let's tune up a little with {p}.",
    },
    tired: {
      ja: "よくがんばったね。無理しないで、{p}で少し休もう。",
      en: "You did well today. No need to push. Let's rest a bit with {p}.",
    },
    irritated: {
      ja: "そういう日もあるよ。{p}で、ひと息つこうか。",
      en: "Some days are like that. Let's take a breather with {p}.",
    },
    focus: {
      ja: "集中したいんだね。{p}で、頭を切り替えようか。",
      en: "You want to focus. Let's switch gears with {p}.",
    },
    sleepyAsk: {
      ja: "眠いんだね。少し眠りたい？ それとも目を覚ましたい？",
      en: "Sleepy, huh? Would you like a short nap, or would you rather wake up?",
    },
    sleepyNap: { ja: "わかった。{p}で、少しだけ休もう。", en: "All right. Let's rest for a little while with {p}." },
    sleepyWake: { ja: "わかった。{p}で、すっきり目を覚まそうか。", en: "All right. Let's wake you up with {p}." },
    another: { ja: "それなら{p}はどうかな。", en: "Then how about {p}?" },
    noMore: {
      ja: "いまのおすすめはこのくらいかな。気になったものを聴いてみて。",
      en: "That's about all I have for now. Try whichever one caught your eye.",
    },
    thanks: { ja: "どういたしまして。いつでも声をかけて。", en: "You're welcome. Talk to me anytime." },
    sorry: {
      ja: "ごめん、いまうまく返事ができないみたいだ。少ししたら、また話しかけて。",
      en: "Sorry, I can't seem to answer right now. Try again in a little while.",
    },
    capped: {
      ja: "今日はたくさん話せたね。続きはまた明日にしよう。",
      en: "We talked a lot today. Let's pick this up again tomorrow.",
    },
  },
  pet: {
    morning: {
      ja: "おはよう！ 今日は{p}から、いっしょに始めよ？",
      en: "Good morning! Let's start today with {p} together, okay?",
    },
    afternoon: { ja: "こんにちは！ いまの気分、おしえて？", en: "Hi! How are you feeling? Tell me!" },
    evening: {
      ja: "おかえりー！ 今日もいっぱいがんばったね。{p}を聴いて、いっしょにごろんしよ？",
      en: "Welcome back! You did so much today. Let's listen to {p} and flop down together, okay?",
    },
    lateNight: {
      ja: "もう夜だね。{p}を聴いて、いっしょにねんねしよ？",
      en: "It's nighttime. Let's listen to {p} and go to sleep together, okay?",
    },
    energetic: {
      ja: "元気なんだね！ うれしいな！ {p}、いっしょに聴こ？",
      en: "You're full of energy! That makes me happy! Let's listen to {p} together!",
    },
    normal: { ja: "ふつうもいいね！ {p}で、いっしょにととのえよ？", en: "Okay is good! Let's tune up with {p} together, okay?" },
    tired: {
      ja: "つかれたんだね。{p}を聴いて、いっしょにひと休みしよ？",
      en: "You're tired, huh. Let's take a little break with {p} together, okay?",
    },
    irritated: {
      ja: "そっか、イライラしちゃったんだね。{p}で、ふーってしよ？",
      en: "Grumpy, huh? Let's let it all out with {p}, okay?",
    },
    focus: { ja: "集中したいんだね！ {p}で、いっしょにがんばろ！", en: "You want to focus! Let's do our best with {p}!" },
    sleepyAsk: {
      ja: "ねむいんだね。ちょっと眠る？ それとも、目をさます？",
      en: "Sleepy, huh? Want a little nap, or want to wake up?",
    },
    sleepyNap: { ja: "じゃあ{p}で、ちょっとだけおやすみしよ？", en: "Then let's take a tiny nap with {p}, okay?" },
    sleepyWake: { ja: "じゃあ{p}で、しゃきっとしよ！", en: "Then let's perk up with {p}!" },
    another: { ja: "じゃあ、{p}は？", en: "Then how about {p}?" },
    noMore: { ja: "おすすめはこれでぜんぶだよ。好きなのを聴いてね！", en: "That's all my picks! Listen to the one you like!" },
    thanks: { ja: "えへへ、どういたしまして！", en: "Hehe, you're welcome!" },
    sorry: {
      ja: "ごめんね、いまうまくお話しできないみたい。またあとで話しかけてね。",
      en: "Sorry, I can't talk well right now. Talk to me again later!",
    },
    capped: { ja: "今日はいっぱいお話ししたね！ また明日ね！", en: "We talked so much today! See you tomorrow!" },
  },
};

/** 気分を選んだときの台詞。「眠い」はまず、眠りたいのか目を覚ましたいのかを尋ねる。 */
export function moodLineKind(mood: PartnerMood): FixedLineKind {
  return mood === "sleepy" ? "sleepyAsk" : mood;
}

export function sleepyLineKind(choice: SleepyChoice): FixedLineKind {
  return choice === "nap" ? "sleepyNap" : "sleepyWake";
}

/** 開口一番の台詞。会話のひとまとまり（lib/partner.ts の partnerPhase）ごとに1つ。 */
export function openingLineKind(phase: PartnerPhase): FixedLineKind {
  return phase;
}

/**
 * つらい気持ちを打ち明けられたときの決まった文（lib/partner.ts の looksLikeCrisis）。役の
 * 口調では返さない。関数の CARE_REPLY と同じ文（check:partner が突き合わせる）。相談窓口は
 * 厚生労働省「まもろうよ こころ」の電話相談の一覧に載っているよりそいホットライン
 * （24時間・無料、外国語にも対応）。番号を変えるときは関数と両方。
 */
export const CARE_LINE: LocalizedText = {
  ja: "話してくれてありがとう。とてもつらい気持ちなんですね。どうかひとりで抱えないで、いますぐ、信頼できる人か相談窓口に話してみてください。日本では「よりそいホットライン」（0120-279-338、24時間・無料）につながります。ここは AI の会話なので、十分な力にはなれません。",
  en: "Thank you for telling me. That sounds really painful. Please don't carry this alone: talk right now to someone you trust, or to a crisis line where you live. In Japan, Yorisoi Hotline (0120-279-338, free, 24 hours) also takes calls in other languages. This is an AI chat, and it can't give you the help you deserve.",
};

/** CARE_LINE の中の電話番号（画面は押せば電話をかけられるリンクにする）。 */
export const CARE_PHONE = { text: "0120-279-338", tel: "tel:0120279338" } as const;

/** 台詞を1つ。プログラムを勧める台詞には、その名前（いまの言語の名前）を渡す。 */
export function fixedLine(role: PartnerRole, kind: FixedLineKind, locale: Locale, programName?: string): string {
  const template = FIXED_LINES[role][kind][locale];
  if (!template.includes("{p}")) return template;
  const name = programName ?? "";
  const quoted = locale === "en" ? `"${name}"` : `『${name}』`;
  // 関数で渡す：文字列で渡すと、名前の中の $& などを置き換えの記号として読んでしまう。
  return template.replace("{p}", () => quoted);
}
