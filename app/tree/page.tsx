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
  DAILY_MAX,
  LISTEN_DAILY_MAX,
  MATURE_POINTS,
  POINTS_PER_STAGE,
  TREE_COMPLETE_AT,
  TREE_STAGES,
  WATER_POINTS,
  isTreeComplete,
  stageProgress,
  treePercent,
  treeStage,
  treeStageIndex,
  type TreeDayStatus,
} from "@/lib/sync-tree";
import { foldOf, useSyncTreeStore, useSyncTreeView } from "@/store/useSyncTreeStore";
import { useAuthStore } from "@/store/useAuthStore";
import SyncTreeWaterScene from "@/components/SyncTreeWaterScene";
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
 * 木はログイン中だけの機能で、データはアカウントにだけある
 * （store/useSyncTreeStore）。未ログインではログインを促す。
 * 段階名・育てた木数はこの画面が受け持ち、進捗％はホームのカードと両方に出す。
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
        say(`水やりしました。+${WATER_POINTS}`, null);
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
                  title={`${String(stage.num).padStart(2, "0")} ${stage.name}`}
                  percent={treePercent(points)}
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

/** 段階の中の進み具合。1マス＝1ポイント（13マス、大樹のあとは7マス）。 */
function SegmentBar({ filled, size, label }: { filled: number; size: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={size}
      aria-valuenow={filled}
      aria-label={label}
      className="flex gap-1"
    >
      {Array.from({ length: size }, (_, i) => (
        <span
          key={i}
          className={`h-3 flex-1 rounded-full ${i < filled ? "" : "bg-navy-lighter"}`}
          style={
            i < filled
              ? { background: "linear-gradient(to right, var(--dyn-accent-dark), var(--dyn-accent))" }
              : { boxShadow: "inset 1px 1px 2px var(--shadow-neu-dark)" }
          }
        />
      ))}
    </div>
  );
}

/**
 * 育ち具合。段階名と％は大きな木の上に出ているので、ここは「あといくつで
 * 何になるか」とポイントの実数（ルールがポイントで語られるので）を受け持つ。
 */
function NowCard({ points, grown }: { points: number; grown: number }) {
  const progress = stageProgress(points);
  const next = TREE_STAGES[Math.min(treeStageIndex(points) + 1, TREE_STAGES.length - 1)];
  return (
    <section className="bg-surface border border-surface-border rounded-3xl p-5 neu-raised flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-text-primary">育ち具合</h2>
        <span className="text-base font-mono font-bold tabular-nums text-accent">
          {points} / {TREE_COMPLETE_AT}
        </span>
      </div>

      <SegmentBar
        filled={progress.filled}
        size={progress.size}
        label={
          progress.phase === "growing"
            ? `次の段階まで ${progress.filled} / ${POINTS_PER_STAGE}`
            : `完成まで ${progress.filled} / ${MATURE_POINTS}`
        }
      />
      <p className="text-base text-text-secondary">
        {progress.phase === "growing" && (
          <>
            「{next.name}」まで あと{" "}
            <b className="text-text-primary tabular-nums">{progress.remaining}</b>
          </>
        )}
        {progress.phase === "maturing" && (
          <>
            大樹になりました。完成まで あと{" "}
            <b className="text-text-primary tabular-nums">{progress.remaining}</b>
          </>
        )}
        {progress.phase === "complete" && "完成しました"}
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
  gain,
  done,
  doneLabel,
  todoLabel = "まだ",
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  gain: string;
  done: boolean;
  doneLabel: string;
  /** まだのときの言い方（既定「まだ」） */
  todoLabel?: string;
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
      <div className="flex flex-col items-end shrink-0">
        <span
          className={`text-lg font-bold tabular-nums ${done ? "text-success" : "text-text-primary"}`}
        >
          {gain}
        </span>
        <span
          className={`flex items-center gap-1 text-xs ${done ? "text-success" : "text-text-muted"}`}
        >
          {done && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}
          {done ? doneLabel : todoLabel}
        </span>
      </div>
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
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-text-primary">今日のおせわ</h2>
        <span className="text-sm text-text-muted">1日 最大 +{DAILY_MAX}</span>
      </div>

      <TodayRow
        icon={Droplets}
        title="水やり"
        detail="木をダブルタップ・1日1回"
        gain={`+${WATER_POINTS}`}
        done={day.watered}
        doneLabel="済み"
      />
      <TodayRow
        icon={Headphones}
        title="プログラムを聴く"
        detail={`5分ごとに +2・1日 +${LISTEN_DAILY_MAX} まで`}
        gain={`+${day.listenPoints} / ${LISTEN_DAILY_MAX}`}
        done={day.listenCapped}
        doneLabel="今日はここまで"
        todoLabel={
          day.listenPoints > 0 ? `あと +${LISTEN_DAILY_MAX - day.listenPoints}` : "まだ"
        }
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
        {POINTS_PER_STAGE} で次の段階へ。16段階目の大樹からさらに {MATURE_POINTS} で完成し、新しい木を育てられます。
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
      <li>木をダブルタップして水やり（1日1回 +{WATER_POINTS}）</li>
      <li>プログラムを5分聴くごとに +2（1日 +{LISTEN_DAILY_MAX} まで）</li>
      <li>{POINTS_PER_STAGE} で次の段階へ。16段階目が大樹</li>
      <li>大樹からさらに {MATURE_POINTS} で完成。新しい木を育てられます</li>
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
