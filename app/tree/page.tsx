"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Droplets,
  Headphones,
  Lock,
  TreeDeciduous,
  type LucideIcon,
} from "lucide-react";
import {
  TREE_STAGES,
  growthLevel,
  isTreeComplete,
  stageProgress,
  treeStage,
  treeStageIndex,
  treeStageName,
  type GrowthLevel,
  type StageProgress,
  type TreeDayStatus,
} from "@/lib/sync-tree";
import { foldOf, useSyncTreeStore, useSyncTreeView } from "@/store/useSyncTreeStore";
import { useLocale, useT, type TFunction } from "@/lib/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import SyncTreeWaterScene from "@/components/SyncTreeWaterScene";
import { CARE_TONE_CLASS, listenCare, waterCare, type CareStatus } from "@/components/tree-care";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";

/**
 * Sync Tree — いまの木が1本、大きく立つ。毎日ここへ来て水をやる（チェックイン）。
 *
 * 育て方（lib/sync-tree.ts）：木をダブルタップ＝水やり 1日1回 +1、プログラムを
 * 5分聴くごとに +2（1日 +5 まで）、13 で次の段階、大樹からさらに 7 で完成。
 * 完成したら「新しい木を育てる」で育てた木が1本増え、苗から育て直す。
 *
 * **画面には数値を出さない**：％・ポイント・「+1」のような加算量は内部だけで使い、
 * 育ち具合は段階名と、目盛りの無い帯と言葉（growthLevel）でぼかして伝える。
 * 出す数字は育てた木の本数と、「1日1回」「5分」という使い方だけ。
 *
 * 木はログイン中だけの機能で、データはアカウントにだけある
 * （store/useSyncTreeStore）。未ログインではログインを促す。
 * 育てた木の本数はこの画面が受け持ち、段階名はホームのカードと両方に出す。
 * メニュー外ページ（/settings・/player と同じ立て付け）で、戻るはホームへ。
 */
/** 1st / 2nd / 3rd / 4th …（英語の「N本目」）。 */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

export default function TreePage() {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const { view, fold, day, unsaved } = useSyncTreeView();
  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);

  const [burst, setBurst] = useState(0);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [live, setLive] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toastSeq = useRef(0);

  // 開いたら読み直す——別の端末でした水やり・リスニングをここで拾う。
  useEffect(() => {
    void useSyncTreeStore.getState().refresh();
  }, []);

  /** 読み上げ（aria-live）と、木の上のひと言。ひと言は1行に収まる短さで別に渡せる。 */
  const say = (text: string, toastText: string | null) => {
    setLive(text);
    if (toastText) {
      toastSeq.current += 1;
      setToast({ id: toastSeq.current, text: toastText });
    }
  };

  const handleWater = () => {
    const store = useSyncTreeStore.getState();
    const beforeStage = treeStageIndex(foldOf(store.events).points);
    const result = store.water();
    if (result === "ok") {
      setBurst((n) => n + 1);
      const after = foldOf(useSyncTreeStore.getState().events).points;
      const afterStage = treeStageIndex(after);
      if (isTreeComplete(after)) {
        const done = t("大樹が育ちきりました", "Your great tree is fully grown");
        say(done, done);
      } else if (afterStage > beforeStage) {
        const grown = t(
          `「${TREE_STAGES[afterStage].name}」に育ちました`,
          `It grew into “${TREE_STAGES[afterStage].nameEn}”`
        );
        say(grown, grown);
      } else {
        say(t("水やりしました", "Watered"), null);
      }
    } else if (result === "already") {
      say(
        t("今日の水やりは済みました。また明日", "You've watered today. See you tomorrow"),
        t("今日の水やりは済みました", "Already watered today")
      );
    } else if (result === "complete") {
      say(
        t("新しい木を植えると、水やりできます", "Plant a new tree to water again"),
        t("新しい木を植えましょう", "Let's plant a new tree")
      );
    }
  };

  const handleReplant = () => {
    setConfirmOpen(false);
    if (!useSyncTreeStore.getState().replant()) return;
    const grown = foldOf(useSyncTreeStore.getState().events).completed.length;
    say(
      t(
        `${grown}本目の木を記録しました。新しい苗を植えました`,
        `Your ${ordinal(grown)} tree is recorded. A new seedling is planted`
      ),
      t(`${grown}本目の木を記録しました`, `Your ${ordinal(grown)} tree is recorded`)
    );
  };

  const points = fold.points;
  const complete = isTreeComplete(points);
  const stage = treeStage(points);
  const stageIdx = treeStageIndex(points);
  const watered = day?.watered ?? false;

  const stageLabel = treeStageName(stage, locale);

  const hint = watered
    ? t("今日の水やりは済みました。また明日", "You've watered today. See you tomorrow")
    : complete
      ? t("新しい木を植えると、水やりできます", "Plant a new tree to water again")
      : t("木をダブルタップして水やり", "Double-tap the tree to water it");

  return (
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      <PageHeader
        title="Sync Tree"
        subtitle={t("水やりとリスニングで育つ、あなたの木", "Your tree grows with watering and listening")}
        leading={
          <button
            onClick={() => router.push("/")}
            aria-label={t("ホームへ戻る", "Back to Home")}
            className="w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary active:scale-95 shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
        }
      />

      <PageColumn>
        {/* モバイルは1カラム（木 → カード）。デスクトップは 左＝木｜右＝カード。 */}
        <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
          {view === "ready" ? (
            <>
              <div className="flex flex-col gap-6">
                <SyncTreeWaterScene
                  interactive
                  stage={stageIdx}
                  title={stageLabel}
                  hint={hint}
                  canWater={!watered && !complete}
                  burst={burst}
                  toast={toast}
                  ariaLabel={
                    watered
                      ? t(
                          `いまの木「${stage.name}」。今日の水やりは済みました`,
                          `Your tree: “${stageLabel}”. You've watered today`
                        )
                      : complete
                        ? t(
                            `いまの木「${stage.name}」。育ちきりました`,
                            `Your tree: “${stageLabel}”. Fully grown`
                          )
                        : t(
                            `いまの木「${stage.name}」。ダブルタップで水やり`,
                            `Your tree: “${stageLabel}”. Double-tap to water`
                          )
                  }
                  onWater={handleWater}
                />
                {complete && <CompletionCard onReplant={() => setConfirmOpen(true)} />}
              </div>

              <div className="flex flex-col gap-6">
                <NowCard points={points} grown={fold.completed.length} />
                {day && <TodayCard day={day} complete={complete} unsaved={unsaved} />}
              </div>
            </>
          ) : (
            <>
              {/* 未ログインでは「星の種」を見せて、何が育つのかを先に伝える。
                  読み込み中・読めないときは空だけ（種を出すとリセットに見える）。 */}
              <SyncTreeWaterScene
                stage={0}
                showTree={view === "logged-out" || view === "unavailable"}
                ariaLabel={view === "logged-out" ? t("星の種", "Star Seed") : undefined}
              />
              <GateCard
                view={view}
                onLogin={() => openAuthModal("login")}
                onRetry={() => {
                  if (user) void useSyncTreeStore.getState().loadForUser(user.id);
                }}
              />
            </>
          )}
        </div>

        {/* 水やり・植え替えの結果を読み上げる */}
        <p className="sr-only" aria-live="polite">
          {live}
        </p>
      </PageColumn>

      <ConfirmDialog
        open={confirmOpen}
        title={t("新しい木を育てますか？", "Grow a new tree?")}
        message={t(
          "いまの大樹を記録して、新しい苗を植えます。育てた木が1本増えます。",
          "Your great tree will be recorded and a new seedling planted. Your count of trees grown goes up by one."
        )}
        confirmLabel={t("新しい木を育てる", "Grow a new tree")}
        tone="accent"
        onConfirm={handleReplant}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}

/**
 * 段階の中の進み具合。目盛りも数字も持たない帯——何マス中いくつ、と数えられる
 * 形にはしない。水をやるたびに少しずつ伸びる（幅の変化はなめらかに見せる）。
 * 読み上げは下の言葉が受け持つので、帯そのものは装飾。
 */
function GrowthBar({ ratio }: { ratio: number }) {
  // 区間の始まりでも「空っぽ」に見えないよう、ほんの少しだけ色を置く
  const width = Math.max(0.04, Math.min(1, ratio));
  return (
    <div
      aria-hidden="true"
      className="h-3 rounded-full bg-navy-lighter overflow-hidden"
      style={{ boxShadow: "inset 1px 1px 3px var(--shadow-neu-dark)" }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{
          width: `${width * 100}%`,
          background: "linear-gradient(to right, var(--dyn-accent-dark), var(--dyn-accent))",
        }}
      />
    </div>
  );
}

/** 育ち具合をひと言で（数値の代わり）。 */
function growthPhrase(
  phase: StageProgress["phase"],
  level: GrowthLevel,
  next: (typeof TREE_STAGES)[number],
  t: TFunction
): string {
  if (phase === "complete") return t("育ちきりました", "Fully grown");
  if (phase === "maturing") {
    return level === "near"
      ? t("もうすぐ育ちきります", "Almost fully grown")
      : t(
          "大樹になりました。実りのときに向けて育っています",
          "It's a great tree now, growing toward bearing fruit"
        );
  }
  if (level === "early") {
    return t(`「${next.name}」に向けて育ちはじめました`, `Starting to grow toward “${next.nameEn}”`);
  }
  if (level === "middle") {
    return t(`「${next.name}」に向けて、すくすく育っています`, `Growing nicely toward “${next.nameEn}”`);
  }
  return t(`もうすぐ「${next.name}」に育ちます`, `Soon it will become “${next.nameEn}”`);
}

/**
 * 育ち具合。段階名は大きな木の上に出ているので、ここは「次に何になるか」を
 * 目盛りの無い帯と言葉で受け持つ（ポイントの実数は出さない）。
 */
function NowCard({ points, grown }: { points: number; grown: number }) {
  const t = useT();
  const progress = stageProgress(points);
  const next = TREE_STAGES[Math.min(treeStageIndex(points) + 1, TREE_STAGES.length - 1)];
  return (
    <section className="bg-surface border border-surface-border rounded-3xl p-5 neu-raised flex flex-col gap-3">
      <h2 className="text-lg font-bold text-text-primary">{t("育ち具合", "Growth")}</h2>
      <GrowthBar ratio={progress.filled / progress.size} />
      <p className="text-base text-text-secondary">
        {growthPhrase(progress.phase, growthLevel(points), next, t)}
      </p>
      <p className="flex items-center gap-1.5 text-sm text-text-secondary">
        <TreeDeciduous size={18} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
        {t("育てた木", "Trees grown:")} <b className="text-text-primary tabular-nums">{grown}</b>
        {t("本", "")}
      </p>
    </section>
  );
}

function TodayRow({
  icon: Icon,
  title,
  detail,
  care,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  /** 右側のひと言と具合（components/tree-care.ts。加算量は出さない） */
  care: CareStatus;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 h-12 rounded-2xl bg-navy neu-inset flex items-center justify-center shrink-0">
        <Icon size={22} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-text-primary">{title}</p>
        <p className="text-sm text-text-secondary">{detail}</p>
      </div>
      <span className={`flex items-center gap-1 text-sm font-bold shrink-0 ${CARE_TONE_CLASS[care.tone]}`}>
        {care.tone === "done" && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
        {t(care.label)}
      </span>
    </div>
  );
}

function TodayCard({
  day,
  complete,
  unsaved,
}: {
  day: TreeDayStatus;
  complete: boolean;
  unsaved: boolean;
}) {
  const t = useT();
  return (
    <section className="bg-surface border border-surface-border rounded-3xl p-5 neu-raised flex flex-col gap-4">
      <h2 className="text-lg font-bold text-text-primary">{t("今日のおせわ", "Today's care")}</h2>

      <TodayRow
        icon={Droplets}
        title={t("水やり", "Watering")}
        detail={t("木をダブルタップ（1日1回）", "Double-tap the tree (once a day)")}
        care={waterCare(day)}
      />
      <TodayRow
        icon={Headphones}
        title={t("プログラムを聴く", "Listen to a program")}
        detail={t("5分ほど聴くごとに育ちます", "It grows with every 5 minutes or so")}
        care={listenCare(day)}
      />

      {!day.listenCapped && !complete && (
        <Link
          href="/session"
          className="min-h-12 rounded-2xl bg-navy text-text-primary text-base font-bold flex items-center justify-center gap-2 px-4 neu-raised-sm neu-press active:scale-95 transition-transform"
        >
          {t("プログラムを選ぶ", "Choose a program")}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      )}

      {unsaved && (
        <p className="text-sm text-warning">
          {t(
            "まだ保存できていない記録があります。通信が戻ると自動で保存します。",
            "Some records haven't been saved yet. They'll be saved automatically when you're back online."
          )}
        </p>
      )}

      <p className="text-sm text-text-muted">
        {t(
          "毎日の水やりとリスニングで少しずつ育ちます。大樹になって実りを迎えたら、新しい木を育てられます。",
          "Your tree grows a little with daily watering and listening. Once it's a great tree bearing fruit, you can grow a new one."
        )}
      </p>
    </section>
  );
}

function CompletionCard({ onReplant }: { onReplant: () => void }) {
  const t = useT();
  return (
    <section className="bg-surface border-2 border-accent rounded-3xl p-5 neu-raised flex flex-col gap-3">
      <p className="flex items-center gap-2 text-lg font-bold text-text-primary">
        <TreeDeciduous size={22} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
        {t("大樹が育ちきりました", "Your great tree is fully grown")}
      </p>
      <p className="text-base text-text-secondary">
        {t(
          "この木を記録して、新しい苗を植えましょう。育てた木が1本増えます。",
          "Record this tree and plant a new seedling. Your count of trees grown goes up by one."
        )}
      </p>
      <button
        onClick={onReplant}
        className="w-full h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised neu-press active:scale-95 transition-all"
      >
        {t("新しい木を育てる", "Grow a new tree")}
      </button>
    </section>
  );
}

function TreeRules() {
  const t = useT();
  return (
    <ul className="flex flex-col gap-1.5 text-sm text-text-secondary list-disc pl-5">
      <li>{t("木をダブルタップして水やり（1日1回）", "Double-tap the tree to water it (once a day)")}</li>
      <li>{t("プログラムを聴くと、さらに育ちます", "Listening to programs helps it grow more")}</li>
      <li>{t("星の種から少しずつ姿を変え、やがて大樹に", "From a star seed, it slowly grows into a great tree")}</li>
      <li>{t("大樹が実りを迎えたら、新しい木を育てられます", "When the great tree bears fruit, you can grow a new one")}</li>
    </ul>
  );
}

function GateCard({
  view,
  onLogin,
  onRetry,
}: {
  view: "unavailable" | "loading" | "logged-out" | "error";
  onLogin: () => void;
  onRetry: () => void;
}) {
  const t = useT();
  if (view === "loading") {
    return (
      <section className="bg-surface border border-surface-border rounded-3xl p-5 neu-raised">
        <p className="text-base text-text-secondary">{t("木を読み込んでいます…", "Loading your tree…")}</p>
      </section>
    );
  }

  if (view === "error") {
    return (
      <section className="bg-surface border border-surface-border rounded-3xl p-5 neu-raised flex flex-col gap-3">
        <p className="text-lg font-bold text-text-primary">{t("木を読み込めませんでした", "Couldn't load your tree")}</p>
        <p className="text-base text-text-secondary">
          {t("通信の状態を確かめて、もう一度お試しください。", "Check your connection and try again.")}
        </p>
        <button
          onClick={onRetry}
          className="w-full h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised neu-press active:scale-95 transition-all"
        >
          {t("再試行", "Try again")}
        </button>
      </section>
    );
  }

  return (
    <section className="bg-surface border border-surface-border rounded-3xl p-6 neu-raised flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-full bg-navy flex items-center justify-center neu-inset">
          <Lock size={28} className="text-text-muted" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <p className="text-lg font-bold text-text-primary">
          {view === "logged-out"
            ? t("ログインすると、あなたの木を育てられます", "Log in to grow your own tree")
            : t(
                "この環境ではアカウント機能を使えないため、木を育てられません",
                "Accounts aren't available here, so you can't grow a tree"
              )}
        </p>
        {view === "logged-out" && (
          <>
            <p className="text-base text-text-secondary">
              {t(
                "育ち具合はアカウントに保存され、どの端末からでも続きを育てられます。",
                "Your tree's growth is saved to your account, so you can keep growing it on any device."
              )}
            </p>
            <button
              onClick={onLogin}
              className="h-12 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press"
            >
              {t("ログイン", "Log in")}
            </button>
          </>
        )}
      </div>
      <TreeRules />
    </section>
  );
}
