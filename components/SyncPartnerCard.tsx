"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Check, Play } from "lucide-react";
import PartnerAvatar from "@/components/PartnerAvatar";
import { usePlayProgram } from "@/components/usePlayProgram";
import { useTodaySky } from "@/components/useTodaySky";
import { useListeningSummary } from "@/components/ListeningRecord";
import { translator, useLocale, useT, type Locale, type LocalizedText } from "@/lib/i18n";
import { getProgramById, programName, type ProgramConfig } from "@/lib/programs";
import { ZODIAC_SIGNS, dailyRecommendation, getZodiacSign, isNightNow, type ZodiacKey } from "@/lib/zodiac";
import { wholeMinutes } from "@/lib/listening-record";
import {
  MOOD_LABEL,
  PARTNER_MESSAGE_MAX,
  PARTNER_MOODS,
  PARTNER_ROLES,
  ROLE_ABOUT,
  ROLE_NAME,
  SLEEPY_CHOICES,
  SLEEPY_LABEL,
  buildPartnerInput,
  calendarDayKey,
  cleanPartnerText,
  looksLikeCrisis,
  partnerCandidates,
  partnerDayKey,
  partnerPhase,
  sleepyProgramId,
  type PartnerMood,
  type PartnerPhase,
  type PartnerRole,
  type PartnerTurn,
  type SleepyChoice,
} from "@/lib/partner";
import {
  CARE_LINE,
  CARE_PHONE,
  LINES_WITH_PROGRAM,
  fixedLine,
  moodLineKind,
  openingLineKind,
  sleepyLineKind,
  type FixedLineKind,
} from "@/lib/partner-lines";
import { askPartner, PartnerError, type PartnerReply } from "@/lib/sync/partner";
import { setPartnerRole, usePartnerRole } from "@/store/usePartnerStore";
import {
  EMPTY_THREAD,
  busyKeyOf,
  newPartnerMessageId,
  partnerThreadKey,
  usePartnerChatStore,
  type PartnerMessage,
  type PartnerScope,
} from "@/store/usePartnerChatStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useCloudSyncStore } from "@/store/useCloudSyncStore";
import { useZodiacStore } from "@/store/useZodiacStore";

/**
 * Sync Partner — ホームの話し相手（シンク彼女・シンク彼氏・シンクペット）。
 *
 * その日の時間帯に合わせてひと言かけ、セッションを1つすすめる：
 *   朝（5:00〜11:59）   … 挨拶＋星空カードと同じ今日の星のプログラム
 *   午後（12:00〜17:59）… いまの気分を尋ねる（6つのボタン）→ 気分に合うプログラム
 *   帰宅後（18:00〜）   … 「おかえり」＋ゆるめるプログラム。22時からは眠りのプログラム
 * 返事は Edge Function `sync-partner` が AI に書かせる（lib/sync/partner.ts）。使えないとき
 * （未ログイン・その日の回数を使い切った・関数が無い・届かない）は決まった台詞
 * （lib/partner-lines.ts）で同じ流れを続ける——ボタンの会話はどちらでも途切れない。
 * 決まりごと（候補の選び方・送る形・語彙）は lib/partner.ts。
 *
 * - 役は user_records の `setting:partner`（store/usePartnerStore.ts）。端末とアカウントで揃う
 * - 会話は端末にだけ、その日のぶんだけ（store/usePartnerChatStore.ts）。開口一番は会話の
 *   ひとまとまり（朝・午後・帰宅後・眠る前）× 役ごとに1回だけ頼み、**カードが画面に入って
 *   から**頼む——下まで送らない日に回数を使わない
 * - 「死にたい」などはっきりした言葉は送らずに決まった文（相談窓口）で答える
 * - 文字は 16px、押せる所は 48px 以上、AI の返事であること・医療の助言ではないことを添える
 *
 * 描画中に端末の記録（役・会話・星座）を読むので、静的 HTML の描画と hydration では何も
 * 出さない（useHydrated）。いまはホームで管理者にだけ出している（app/page.tsx）。
 */

/** 開いたときに見せる会話の数（それより前は「これまでの会話を見る」で開く）。 */
const VISIBLE_MESSAGES = 3;
/** 「2 秒あけて」と断られたとき、もう一度頼むまで待つ時間。関数の間隔（2 秒）より少し長く。 */
const TOO_FAST_RETRY_MS = 2_200;
/** 残りの回数を添え始める数。 */
const REMAINING_NOTE_AT = 5;

const CHIP_ANOTHER: LocalizedText = { ja: "ほかのおすすめは？", en: "Any other ideas?" };
const CHIP_THANKS: LocalizedText = { ja: "ありがとう", en: "Thank you" };

// ─── 描画の補助 ───────────────────────────────────────────────────────────────

const noopSubscribe = () => () => {};

/** hydration が済んだか（静的 HTML の描画と hydration の間は false）。 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

function subscribeMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 15_000);
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

const minuteSnapshot = () => Math.floor(Date.now() / 60_000);
const serverMinute = () => 0;

/** いまの時刻（分の単位）。開いたまま時間帯をまたいでも、会話が切り替わるように。 */
function useMinuteClock(): Date {
  const minute = useSyncExternalStore(subscribeMinute, minuteSnapshot, serverMinute);
  return useMemo(() => new Date(minute * 60_000), [minute]);
}

/** 一度でも画面に入ったか（入ったら true のまま）。 */
function useSeenOnce(ref: React.RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      // 古い WebView：見えたかどうか分からないので、出したら見えたことにする。
      const timer = window.setTimeout(() => setSeen(true), 0);
      return () => window.clearTimeout(timer);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

// ─── 会話の1往復 ───────────────────────────────────────────────────────────────

type TurnAction =
  | { kind: "opening" }
  | { kind: "mood"; mood: PartnerMood }
  | { kind: "sleepy"; choice: SleepyChoice }
  | { kind: "another" }
  | { kind: "thanks" }
  | { kind: "text"; text: string };

/** 1往復に要るもの。描画のたびに組み直し、押したとき・頼むときの値をそのまま使う。 */
interface TurnContext {
  scope: PartnerScope;
  role: PartnerRole;
  phase: PartnerPhase;
  /** 分の単位のいまの時刻（phase と同じ時計）。 */
  now: Date;
  locale: Locale;
  /** AI に頼めるか（ログイン中で、その日の回数が残っている）。 */
  canAsk: boolean;
  sign: ZodiacKey | null;
  skyBeat: number | null;
  skyProgramId: string | null;
  listening: { streakDays: number; todayMin: number } | null;
}

/**
 * 関数がまだ無い（デプロイ前）と分かったら、このページの間は頼まない（押すたびに 404 を
 * 待たない）。読み込み直せばまた確かめる。
 */
let functionMissing = false;

async function askWithRetry(input: Parameters<typeof askPartner>[0]): Promise<PartnerReply> {
  try {
    return await askPartner(input);
  } catch (e) {
    // 前の1通から 2 秒たっていない（別のタブ・別の端末と重なった）。1回だけ待って頼み直す。
    if (e instanceof PartnerError && e.code === "too_fast") {
      await new Promise((resolve) => window.setTimeout(resolve, TOO_FAST_RETRY_MS));
      return askPartner(input);
    }
    throw e;
  }
}

/** AI に渡すこれまでの会話。つらい気持ちのやりとりは渡さない（その言葉は AI に送っていない）。 */
function historyOf(messages: readonly PartnerMessage[]): PartnerTurn[] {
  return messages
    .filter((m) => !m.care && !(m.from === "user" && looksLikeCrisis(m.text)))
    .map((m) => ({ from: m.from, text: m.text }));
}

/**
 * 利用者の1手（開口一番を含む）と、それへの役の返事。AI に頼めなければ決まった台詞で返す。
 * 頼んでいる間は store の busy が立ち、ほかの手は受け付けない。
 */
async function runTurn(ctx: TurnContext, action: TurnAction): Promise<void> {
  const store = usePartnerChatStore.getState();
  if (store.busy !== null) return;
  store.begin(ctx.scope);
  const key = partnerThreadKey(ctx.phase, ctx.role);
  const t = translator(ctx.locale);
  const before = usePartnerChatStore.getState().threads[key] ?? EMPTY_THREAD;

  // ── 気分（午後）と「眠い」の続きを覚える ──
  let mood = before.mood;
  if (action.kind === "mood") {
    mood = action.mood;
    store.patchThread(ctx.scope, key, { mood, sleepy: null });
  } else if (action.kind === "sleepy") {
    store.patchThread(ctx.scope, key, { sleepy: action.choice });
  }

  // ── 利用者のひと言 ──
  const userText =
    action.kind === "opening"
      ? null
      : action.kind === "mood"
        ? t(MOOD_LABEL[action.mood])
        : action.kind === "sleepy"
          ? t(SLEEPY_LABEL[action.choice])
          : action.kind === "another"
            ? t(CHIP_ANOTHER)
            : action.kind === "thanks"
              ? t(CHIP_THANKS)
              : cleanPartnerText(action.text).slice(0, PARTNER_MESSAGE_MAX);
  if (userText === "") return;
  if (userText !== null) {
    store.append(ctx.scope, key, {
      id: newPartnerMessageId(),
      from: "user",
      text: userText,
      programId: null,
      care: false,
      source: "user",
    });
  }

  const say = (text: string, programId: string | null, source: "ai" | "fixed", care = false) =>
    usePartnerChatStore.getState().append(ctx.scope, key, {
      id: newPartnerMessageId(),
      from: "partner",
      text,
      programId,
      care,
      source,
    });

  // ── つらい気持ち：送らずに、決まった文で ──
  if (action.kind === "text" && userText !== null && looksLikeCrisis(userText)) {
    say(t(CARE_LINE), null, "fixed", true);
    return;
  }

  // ── 「眠い」：少し眠りたいのか、目を覚ましたいのかを先に尋ねる（AI に頼まない） ──
  if (action.kind === "mood" && action.mood === "sleepy") {
    say(fixedLine(ctx.role, "sleepyAsk", ctx.locale), null, "fixed");
    return;
  }

  const candidates =
    action.kind === "sleepy"
      ? [sleepyProgramId(action.choice)]
      : partnerCandidates({
          hour: ctx.now.getHours(),
          weekday: ctx.now.getDay(),
          mood,
          skyProgramId: ctx.skyProgramId,
        });

  /** AI に頼めないときの決まった台詞。 */
  const fallback = (capped: boolean): { text: string; programId: string | null } => {
    let kind: FixedLineKind;
    let programId: string | null = candidates[0] ?? null;
    if (action.kind === "opening") kind = openingLineKind(ctx.phase);
    else if (action.kind === "mood") kind = moodLineKind(action.mood);
    else if (action.kind === "sleepy") kind = sleepyLineKind(action.choice);
    else if (action.kind === "thanks") kind = "thanks";
    else if (action.kind === "another") {
      // まだ勧めていない候補を順に。尽きたら「このくらいかな」。
      const offered = new Set(before.messages.map((m) => m.programId).filter((id) => id !== null));
      programId = candidates.find((id) => !offered.has(id)) ?? null;
      kind = programId ? "another" : "noMore";
    } else kind = capped ? "capped" : "sorry";
    const program = programId ? getProgramById(programId) : undefined;
    if (!LINES_WITH_PROGRAM.includes(kind) || !program) {
      // 勧める台詞なのに勧めるものが無い（候補が空）——「このくらいかな」で受ける。
      if (LINES_WITH_PROGRAM.includes(kind)) kind = "noMore";
      return { text: fixedLine(ctx.role, kind, ctx.locale), programId: null };
    }
    return { text: fixedLine(ctx.role, kind, ctx.locale, programName(program, ctx.locale)), programId };
  };

  if (!ctx.canAsk || functionMissing) {
    const line = fallback(false);
    say(line.text, line.programId, "fixed");
    return;
  }

  const input = buildPartnerInput({
    locale: ctx.locale,
    role: ctx.role,
    now: ctx.now,
    sign: ctx.sign,
    skyBeat: ctx.skyBeat,
    mood,
    listening: ctx.listening,
    candidates,
    history: historyOf(before.messages),
    message: userText,
  });

  store.setBusy(busyKeyOf(ctx.scope, key));
  try {
    const reply = await askWithRetry(input);
    say(reply.reply, reply.care ? null : reply.programId, reply.care ? "fixed" : "ai", reply.care);
    if (reply.remaining === 0) {
      // いまのが最後の1回。入力欄を閉じて「また明日」と添える（次を送って断られる前に）。
      usePartnerChatStore.getState().setCapped(ctx.scope, calendarDayKey(new Date()));
    } else if (reply.remaining !== null) {
      usePartnerChatStore.getState().setRemaining(ctx.scope, reply.remaining);
    }
  } catch (e) {
    const code = e instanceof PartnerError ? e.code : "unreachable";
    if (code === "not_configured") functionMissing = true;
    if (code === "bad_input") console.warn("sync-partner: bad_input (the app and the function may be out of step)");
    if (!(e instanceof PartnerError)) console.warn("sync-partner: unexpected error", e);
    const capped = code === "daily_limit";
    if (capped) usePartnerChatStore.getState().setCapped(ctx.scope, calendarDayKey(new Date()));
    const line = fallback(capped);
    say(line.text, line.programId, "fixed");
  } finally {
    usePartnerChatStore.getState().setBusy(null);
  }
}

// ─── 部品 ─────────────────────────────────────────────────────────────────────

/** 気分・「眠い」の続き・チップのボタン。左右の余白は使う所で付ける（同じ性質のクラスを
 *  並べて上書きすると、どちらが勝つかは書いた順ではなく CSS の順で決まる）。 */
const actionButton =
  "min-h-12 rounded-xl bg-navy text-text-primary text-base font-medium leading-tight neu-raised-sm neu-press disabled:opacity-50";

/** 相談窓口の番号は、押せば電話をかけられるように。 */
function CareText({ text }: { text: string }) {
  const parts = text.split(CARE_PHONE.text);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <a href={CARE_PHONE.tel} className="font-bold text-primary underline underline-offset-2">
              {CARE_PHONE.text}
            </a>
          )}
        </span>
      ))}
    </>
  );
}

function Bubble({ message, partnerName, youLabel }: { message: PartnerMessage; partnerName: string; youLabel: string }) {
  if (message.from === "user") {
    return (
      <p className="self-end max-w-[85%] rounded-2xl rounded-tr-md bg-primary/15 px-3.5 py-2.5 text-base leading-relaxed text-text-primary break-words">
        <span className="sr-only">{youLabel}：</span>
        {message.text}
      </p>
    );
  }
  return (
    <p
      className={`self-start max-w-[92%] rounded-2xl rounded-tl-md bg-navy neu-inset px-3.5 py-3 text-base leading-relaxed text-text-primary break-words ${
        message.care ? "border border-warning" : ""
      }`}
    >
      <span className="sr-only">{partnerName}：</span>
      {message.care ? <CareText text={message.text} /> : message.text}
    </p>
  );
}

function TypingBubble({ label }: { label: string }) {
  return (
    <div className="self-start rounded-2xl rounded-tl-md bg-navy neu-inset px-4 py-4 flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="typing-dot block w-2 h-2 rounded-full bg-text-muted"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function ProgramTile({ program, onStart }: { program: ProgramConfig; onStart: () => void }) {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="rounded-2xl border border-surface-border p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="w-11 h-11 shrink-0 rounded-xl bg-navy neu-inset flex items-center justify-center text-xl"
        >
          {program.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-2 text-xs text-text-secondary">
            <span>{t("おすすめのセッション", "Suggested session")}</span>
            <span className="shrink-0 text-sm">
              {t(
                `${Math.round(program.defaultDuration / 60)}分`,
                `${Math.round(program.defaultDuration / 60)} min`
              )}
            </span>
          </p>
          <p className="text-base font-bold text-text-primary leading-snug break-words">
            {programName(program, locale)}
          </p>
        </div>
      </div>
      <button
        onClick={onStart}
        className="w-full min-h-12 px-3 rounded-2xl bg-primary text-on-primary text-base font-bold flex items-center justify-center gap-2 neu-press active:scale-[0.98]"
      >
        <Play size={18} strokeWidth={2} aria-hidden="true" />
        {t("このセッションをはじめる", "Start this session")}
      </button>
    </div>
  );
}

// ─── 役を選ぶ ─────────────────────────────────────────────────────────────────

function RoleChooser({
  current,
  onPick,
  onCancel,
}: {
  current: PartnerRole | null;
  onPick: (role: PartnerRole) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // 「相手を変える」から開いたときは見出しへ（押したボタンが消えるので、読み上げの位置を移す）。
  // 初めて選ぶとき（ホームを開いただけ）は動かさない。
  const reopened = onCancel !== undefined;
  useEffect(() => {
    if (reopened) headingRef.current?.focus();
  }, [reopened]);

  return (
    <section
      aria-labelledby={headingId}
      className="bg-surface border border-surface-border rounded-3xl neu-raised p-4 flex flex-col gap-3"
    >
      <header className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-secondary leading-tight">Sync Partner</p>
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-lg font-bold text-text-primary outline-none">
            {t("話し相手を選んでください", "Choose who to talk to")}
          </h2>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="shrink-0 min-h-12 px-2 -mr-2 text-sm font-medium text-primary"
          >
            {t("戻る", "Back")}
          </button>
        )}
      </header>
      {!current && (
        <p className="text-base leading-relaxed text-text-secondary">
          {t(
            "その日の気分を聞いて、合うセッションをすすめてくれる話し相手です。",
            "A companion who asks how you feel and suggests a session that fits your day."
          )}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {PARTNER_ROLES.map((r) => (
          <button
            key={r}
            onClick={() => onPick(r)}
            aria-current={current === r ? "true" : undefined}
            className="flex items-center gap-3 min-h-[72px] px-3 py-2 rounded-2xl bg-navy neu-raised-sm neu-press text-left"
          >
            <PartnerAvatar role={r} />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-text-primary">{t(ROLE_NAME[r])}</span>
              <span className="block text-sm text-text-secondary">{t(ROLE_ABOUT[r])}</span>
            </span>
            {current === r && <Check size={20} strokeWidth={2} className="shrink-0 text-primary" aria-hidden="true" />}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-muted">{t("あとからいつでも変えられます", "You can change this anytime.")}</p>
    </section>
  );
}

// ─── 会話 ─────────────────────────────────────────────────────────────────────

function PartnerChat({
  role,
  onChangeRole,
  focusHeading,
}: {
  role: PartnerRole;
  onChangeRole: () => void;
  focusHeading: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const playProgram = usePlayProgram();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const seen = useSeenOnce(sectionRef);

  // 役を選び直した直後は見出しへ（押したボタンが消えるので、読み上げの位置を移す）。
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  // ── いつ・だれの会話か ──
  const now = useMinuteClock();
  const phase = partnerPhase(now.getHours());
  const day = partnerDayKey(now);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  // 会話の持ち主は、この端末が結びついているアカウント（オフラインで起動してログインの
  // 確認が取れない間も同じ人の会話のまま）。
  const owner = useCloudSyncStore((s) => s.account?.id ?? "anon");
  const scope = useMemo(() => ({ owner, day }), [owner, day]);
  const key = partnerThreadKey(phase, role);

  const begin = usePartnerChatStore((s) => s.begin);
  useEffect(() => {
    begin(scope);
  }, [begin, scope]);

  const scopeReady = usePartnerChatStore((s) => s.owner === owner && s.day === day);
  const storedThread = usePartnerChatStore((s) => s.threads[key]);
  const thread = scopeReady ? (storedThread ?? EMPTY_THREAD) : EMPTY_THREAD;
  const busy = usePartnerChatStore((s) => s.busy);
  const busyHere = busy === busyKeyOf(scope, key);
  const cappedOn = usePartnerChatStore((s) => (s.owner === owner ? s.cappedOn : null));
  const remaining = usePartnerChatStore((s) => (s.owner === owner && s.day === day ? s.remaining : null));
  const capped = cappedOn === calendarDayKey(now);

  // ── 朝のおすすめ：星空カードと同じ今日の星のプログラム ──
  const selectedSign = useZodiacStore((s) => s.selectedSign);
  const { sky, failed: skyFailed, now: skyNow } = useTodaySky();
  const heroSign = sky ? ZODIAC_SIGNS[isNightNow(skyNow) ? sky.moonIndex : sky.sunIndex] : undefined;
  const effectiveSign = selectedSign ?? heroSign?.key ?? null;
  const rec = useMemo(() => {
    const sign = effectiveSign ? getZodiacSign(effectiveSign) : undefined;
    return sign ? dailyRecommendation(sky, sign, skyNow, locale) : null;
  }, [effectiveSign, sky, skyNow, locale]);
  const skySettled = sky !== null || skyFailed;

  // ── 帰宅後にほめる、聴いた習慣 ──
  const summary = useListeningSummary();
  const streakDays = summary?.dayStreak ?? null;
  const todayMin = summary ? wholeMinutes(summary.todaySec) : null;

  const ctx = useMemo<TurnContext>(
    () => ({
      scope,
      role,
      phase,
      now,
      locale,
      canAsk: user !== null && !capped,
      sign: selectedSign,
      skyBeat: rec && rec.tag !== null ? rec.beatFreq : null,
      skyProgramId: rec?.programId ?? null,
      listening: streakDays !== null && todayMin !== null ? { streakDays, todayMin } : null,
    }),
    [scope, role, phase, now, locale, user, capped, selectedSign, rec, streakDays, todayMin]
  );

  // ── 開口一番：カードが画面に入ってから、その会話で1回だけ ──
  const empty = thread.messages.length === 0;
  const waitingForSky = phase === "morning" && !skySettled;
  useEffect(() => {
    if (!seen || authLoading || !scopeReady || !empty || busy !== null || waitingForSky) return;
    void runTurn(ctx, { kind: "opening" });
  }, [seen, authLoading, scopeReady, empty, busy, waitingForSky, ctx]);

  // ── 表示 ──
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? thread.messages : thread.messages.slice(-VISIBLE_MESSAGES);
  const hiddenCount = thread.messages.length - shown.length;

  // いちばん新しいおすすめ（つらい気持ちの決まった文より後のものだけ）。
  let programId: string | null = null;
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const m = thread.messages[i];
    if (m.care) break;
    if (m.from === "partner" && m.programId) {
      programId = m.programId;
      break;
    }
  }
  const program = programId ? getProgramById(programId) : undefined;

  const [draft, setDraft] = useState("");
  const locked = busy !== null || empty;
  const act = (action: TurnAction) => void runTurn(ctx, action);
  const send = () => {
    const text = cleanPartnerText(draft);
    if (!text || locked) return;
    setDraft("");
    act({ kind: "text", text });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 日本語の変換を確定する Enter では送らない（Safari は確定の keydown で isComposing が
    // false のことがあるので keyCode 229 も見る）。
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    send();
  };

  const partnerName = t(ROLE_NAME[role]);
  const askingMood = phase === "afternoon" && thread.mood === null;
  const askingSleepy = thread.mood === "sleepy" && thread.sleepy === null;
  // 相談窓口を案内した直後は、気分やおすすめのボタンを並べない（話しかける欄だけ残す）。
  const afterCare = thread.messages.at(-1)?.care === true;

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      className="bg-surface border border-surface-border rounded-3xl neu-raised p-4 flex flex-col gap-3"
    >
      <header className="flex items-center gap-3">
        <PartnerAvatar role={role} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-secondary leading-tight">Sync Partner</p>
          <h2
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-bold text-text-primary leading-tight outline-none"
          >
            {partnerName}
          </h2>
        </div>
        <button
          onClick={onChangeRole}
          className="shrink-0 min-h-12 px-2 -mr-2 text-sm font-medium text-primary"
        >
          {t("相手を変える", "Change")}
        </button>
      </header>

      {hiddenCount > 0 || expanded ? (
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="self-center min-h-12 px-3 text-sm font-medium text-primary"
        >
          {expanded
            ? t("会話を折りたたむ", "Show less")
            : t(`これまでの会話を見る（${hiddenCount}件）`, `Show earlier messages (${hiddenCount})`)}
        </button>
      ) : null}

      <div role="log" aria-live="polite" aria-label={t("会話", "Conversation")} className="flex flex-col gap-2">
        {shown.map((m) => (
          <Bubble key={m.id} message={m} partnerName={partnerName} youLabel={t("あなた", "You")} />
        ))}
        {(busyHere || empty) && <TypingBubble label={t("返事を書いています…", "Typing…")} />}
      </div>

      {program && <ProgramTile program={program} onStart={() => playProgram(program)} />}

      {!empty &&
        !afterCare &&
        (askingMood ? (
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("いまの気分", "How you feel")}>
            {PARTNER_MOODS.map((m) => (
              <button
                key={m}
                disabled={locked}
                onClick={() => act({ kind: "mood", mood: m })}
                className={`${actionButton} px-1`}
              >
                {t(MOOD_LABEL[m])}
              </button>
            ))}
          </div>
        ) : askingSleepy ? (
          <div className="grid grid-cols-2 gap-2">
            {SLEEPY_CHOICES.map((c) => (
              <button
                key={c}
                disabled={locked}
                onClick={() => act({ kind: "sleepy", choice: c })}
                className={`${actionButton} px-2`}
              >
                {t(SLEEPY_LABEL[c])}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button disabled={locked} onClick={() => act({ kind: "another" })} className={`${actionButton} px-4`}>
              {t(CHIP_ANOTHER)}
            </button>
            <button disabled={locked} onClick={() => act({ kind: "thanks" })} className={`${actionButton} px-4`}>
              {t(CHIP_THANKS)}
            </button>
          </div>
        ))}

      {authLoading ? null : user === null ? (
        <div className="rounded-2xl bg-navy neu-inset p-3 flex flex-col gap-2">
          <p className="text-sm leading-relaxed text-text-secondary">
            {t(
              "ログインすると、自由に話しかけられます。その日に合わせた返事は AI が書きます。",
              "Log in to talk freely. AI writes replies that fit your day."
            )}
          </p>
          <button
            onClick={() => openAuthModal("login")}
            className="self-start min-h-12 px-4 rounded-xl bg-navy text-primary text-base font-bold neu-raised-sm neu-press"
          >
            {t("ログイン", "Log in")}
          </button>
        </div>
      ) : capped ? (
        <p className="text-sm leading-relaxed text-text-secondary">
          {t(
            "話しかけられるのは1日30回までです。また明日、話しかけてください。",
            "You can send up to 30 messages a day. Please come back tomorrow."
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={PARTNER_MESSAGE_MAX}
              enterKeyHint="send"
              autoComplete="off"
              placeholder={t("話しかける…", "Say something…")}
              aria-label={t("話しかける", "Say something")}
              className="flex-1 min-w-0 h-12 rounded-2xl bg-navy neu-inset px-4 text-base text-text-primary placeholder:text-text-muted"
            />
            <button
              onClick={send}
              disabled={locked || cleanPartnerText(draft) === ""}
              className="shrink-0 min-h-12 px-4 rounded-2xl bg-navy text-primary text-base font-bold neu-raised-sm neu-press disabled:opacity-50"
            >
              {t("送る", "Send")}
            </button>
          </div>
          {remaining !== null && remaining <= REMAINING_NOTE_AT && (
            <p className="text-sm text-text-secondary">
              {t(`今日はあと ${remaining} 回話せます`, `${remaining} more ${remaining === 1 ? "message" : "messages"} today`)}
            </p>
          )}
        </div>
      )}

      {!authLoading && user !== null && (
        <p className="text-xs leading-relaxed text-text-muted">
          {t(
            "返事は AI が書いています。医療の助言ではありません。話しかけた言葉は、返事を作るために AI のサービスへ送られます。",
            "Replies are written by AI and are not medical advice. What you type is sent to an AI service to write the reply."
          )}
        </p>
      )}
    </section>
  );
}

// ─── カード ───────────────────────────────────────────────────────────────────

export default function SyncPartnerCard() {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return <PartnerCardBody />;
}

function PartnerCardBody() {
  const role = usePartnerRole();
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState(false);

  if (!role || choosing) {
    return (
      <RoleChooser
        current={role}
        onPick={(r) => {
          setPartnerRole(r);
          setChoosing(false);
          setPicked(true);
        }}
        onCancel={
          role
            ? () => {
                setChoosing(false);
                setPicked(true);
              }
            : undefined
        }
      />
    );
  }
  return <PartnerChat role={role} onChangeRole={() => setChoosing(true)} focusHeading={picked} />;
}
