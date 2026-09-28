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
  type GrowthLevel,
  type StageProgress,
  type TreeDayStatus,
} from "@/lib/sync-tree";
import { foldOf, useSyncTreeStore, useSyncTreeView } from "@/store/useSyncTreeStore";
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
export default function TreePage() {
  const router = useRouter();
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
        say("大樹が育ちきりました", "大樹が育ちきりました");
      } else if (afterStage > beforeStage) {
        const grown = `「${TREE_STAGES[afterStage].name}」に育ちました`;
        say(grown, grown);
      } else {
        say("水やりしました", null);
      }
    } else if (result === "already") {
      say("今日の水やりは済みました。また明日", "今日の水やりは済みました");
    } else if (result === "complete") {
      say("新しい木を植えると、水やりできます", "新しい木を植えましょう");
    }
  };

  const handleReplant = () => {
    setConfirmOpen(false);
    if (!useSyncTreeStore.getState().replant()) return;
    const grown = foldOf(useSyncTreeStore.getState().events).completed.length;
    say(`${grown}本目の木を記録しました。新しい苗を植えました`, `${grown}本目の木を記録しました`);
  };

  const points = fold.points;
  const complete = isTreeComplete(points);
  const stage = treeStage(points);
  const stageIdx = treeStageIndex(points);
  const watered = day?.watered ?? false;

  const hint = watered
    ? "今日の水やりは済みました。また明日"
    : complete
      ? "新しい木を植えると、水やりできます"
      : "木をダブルタップして水やり";

  return (
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      <PageHeader
        title="Sync Tree"
        subtitle="水やりとリスニングで育つ、あなたの木"
        leading={
          <button
            onClick={() => router.push("/")}
            aria-label="ホームへ戻る"
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
                  title={stage.name}
                  hint={hint}
                  canWater={!watered && !complete}
                  burst={burst}
                  toast={toast}
                  ariaLabel={
                    watered
                      ? `いまの木「${stage.name}」。今日の水やりは済みました`
                      : complete
                        ? `いまの木「${stage.name}」。育ちきりました`
                        : `いまの木「${stage.name}」。ダブルタップで水やり`
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
                ariaLabel={view === "logged-out" ? "星の種" : undefined}
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
        title="新しい木を育てますか？"
        message="いまの大樹を記録して、新しい苗を植えます。育てた木が1本増えます。"
        confirmLabel="新しい木を育てる"
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
function growthPhrase(phase: StageProgress["phase"], level: GrowthLevel, nextName: string): string {
  if (phase === "complete") return "育ちきりました";
  if (phase === "maturing") {
    return level === "near"
      ? "もうすぐ育ちきります"
      : "大樹になりました。実りのときに向けて育っています";
  }
  if (level === "early") return `「${nextName}」に向けて育ちはじめました`;
  if (level === "middle") return `「${nextName}」に向けて、すくすく育っています`;
  return `もうすぐ「${nextName}」に育ちます`;
}

/**
 * 育ち具合。段階名は大きな木の上に出ているので、ここは「次に何になるか」を
 * 目盛りの無い帯と言葉で受け持つ（ポイントの実数は出さない）。
 */
function NowCard({ points, grown }: { points: number; grown: number }) {
  const progress = stageProgress(points);
  const next = TREE_STAGES[Math.min(treeStageIndex(points) + 1, TREE_STAGES.length - 1)];
  return (
    <section className="bg-surface border border-surface-border rounded-3xl p-5 neu-raised flex flex-col gap-3">
      <h2 className="text-lg font-bold text-text-primary">育ち具合</h2>
      <GrowthBar ratio={progress.filled / progress.size} />
      <p className="text-base text-text-secondary">
        {growthPhrase(progress.phase, growthLevel(points), next.name)}
      </p>
      <p className="flex items-center gap-1.5 text-sm text-text-secondary">
        <TreeDeciduous size={18} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
        育てた木 <b className="text-text-primary tabular-nums">{grown}</b>本
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
        {care.label}
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
  return (
    <section className="bg-surface border border-surface-border rounded-3xl p-5 neu-raised flex flex-col gap-4">
      <h2 className="text-lg font-bold text-text-primary">今日のおせわ</h2>

      <TodayRow
        icon={Droplets}
        title="水やり"
        detail="木をダブルタップ（1日1回）"
        care={waterCare(day)}
      />
      <TodayRow
        icon={Headphones}
        title="プログラムを聴く"
        detail="5分ほど聴くごとに育ちます"
        care={listenCare(day)}
      />

      {!day.listenCapped && !complete && (
        <Link
          href="/session"
          className="min-h-12 rounded-2xl bg-navy text-text-primary text-base font-bold flex items-center justify-center gap-2 px-4 neu-raised-sm neu-press active:scale-95 transition-transform"
        >
          プログラムを選ぶ
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      )}

      {unsaved && (
        <p className="text-sm text-warning">
          まだ保存できていない記録があります。通信が戻ると自動で保存します。
        </p>
      )}

      <p className="text-sm text-text-muted">
        毎日の水やりとリスニングで少しずつ育ちます。大樹になって実りを迎えたら、新しい木を育てられます。
      </p>
    </section>
  );
}

function CompletionCard({ onReplant }: { onReplant: () => void }) {
  return (
    <section className="bg-surface border-2 border-accent rounded-3xl p-5 neu-raised flex flex-col gap-3">
      <p className="flex items-center gap-2 text-lg font-bold text-text-primary">
        <TreeDeciduous size={22} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
        大樹が育ちきりました
      </p>
      <p className="text-base text-text-secondary">
        この木を記録して、新しい苗を植えましょう。育てた木が1本増えます。
      </p>
      <button
        onClick={onReplant}
        className="w-full h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised neu-press active:scale-95 transition-all"
      >
        新しい木を育てる
      </button>
    </section>
  );
}

function TreeRules() {
  return (
    <ul className="flex flex-col gap-1.5 text-sm text-text-secondary list-disc pl-5">
      <li>木をダブルタップして水やり（1日1回）</li>
      <li>プログラムを聴くと、さらに育ちます</li>
      <li>星の種から少しずつ姿を変え、やがて大樹に</li>
      <li>大樹が実りを迎えたら、新しい木を育てられます</li>
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
  if (view === "loading") {
    return (
      <section className="bg-surface border border-surface-border rounded-3xl p-5 neu-raised">
        <p className="text-base text-text-secondary">木を読み込んでいます…</p>
      </section>
    );
  }

  if (view === "error") {
    return (
      <section className="bg-surface border border-surface-border rounded-3xl p-5 neu-raised flex flex-col gap-3">
        <p className="text-lg font-bold text-text-primary">木を読み込めませんでした</p>
        <p className="text-base text-text-secondary">
          通信の状態を確かめて、もう一度お試しください。
        </p>
        <button
          onClick={onRetry}
          className="w-full h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised neu-press active:scale-95 transition-all"
        >
          再試行
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
            ? "ログインすると、あなたの木を育てられます"
            : "この環境ではアカウント機能を使えないため、木を育てられません"}
        </p>
        {view === "logged-out" && (
          <>
            <p className="text-base text-text-secondary">
              育ち具合はアカウントに保存され、どの端末からでも続きを育てられます。
            </p>
            <button
              onClick={onLogin}
              className="h-12 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press"
            >
              ログイン
            </button>
          </>
        )}
      </div>
      <TreeRules />
    </section>
  );
}
