"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  Droplets,
  Headphones,
  Sparkles,
  TreeDeciduous,
  type LucideIcon,
} from "lucide-react";
import { isTreeComplete, treeStage } from "@/lib/sync-tree";
import { useSyncTreeView, type SyncTreeView } from "@/store/useSyncTreeStore";
import { CARE_TONE_CLASS, listenCare, waterCare, type CareStatus } from "@/components/tree-care";

/**
 * Sync Tree — ホームの状態バー。
 *
 * 木の絵はここには出さない（大きな木は /tree）。ホームを開いて読みたいのは
 * 「いまの段階」と「今日のおせわが済んだか」の2つなので、1行目＝ラベルと段階名、
 * 2行目＝今日の水やり・リスニングの具合、だけの小さなカードにしてある。
 * カード全体が /tree へのリンクで、水やりはそこでする。
 *
 * **数値は出さない**（lib/sync-tree.ts）——段階名と、/tree の「今日のおせわ」と
 * 同じ言葉（components/tree-care.ts）だけ。育ちきった木には水をやれないので、
 * そのときは水やり・リスニングの代わりに「育ちきりました」を出す。
 *
 * 木はログイン中だけの機能（store/useSyncTreeStore）。表示できないあいだは
 * 2行目を状況のひと言に置き換え、段階名は出さない（読み込み中に「星の種」を
 * 出すと、木がリセットされたように見える）。どの状態でも2行のままにして、
 * 読み込みが終わったときに下のカードが押し下げられないようにしてある。
 */

/** 表示できないあいだ、2行目に出すひと言。 */
const WAITING_TEXT: Record<Exclude<SyncTreeView, "ready">, string> = {
  "logged-out": "ログインすると、木を育てられます",
  loading: "読み込み中…",
  error: "木を読み込めませんでした",
  unavailable: "水やりとリスニングで育つ、あなたの木",
};

function CareItem({ icon: Icon, label, care }: { icon: LucideIcon; label: string; care: CareStatus }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon size={18} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="text-text-secondary">{label}</span>
      <span className={`inline-flex items-center gap-0.5 font-bold ${CARE_TONE_CLASS[care.tone]}`}>
        {care.tone === "done" && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}
        {care.label}
      </span>
    </span>
  );
}

export default function SyncTreeCard() {
  const { view, fold, day } = useSyncTreeView();
  const ready = view === "ready";

  let status: ReactNode = null;
  if (view !== "ready") {
    status = <span className="text-text-secondary">{WAITING_TEXT[view]}</span>;
  } else if (isTreeComplete(fold.points)) {
    status = (
      <>
        <span className="inline-flex items-center gap-1 font-bold text-accent">
          <Sparkles size={18} strokeWidth={1.5} aria-hidden="true" />
          育ちきりました
        </span>
        <span className="text-text-secondary">新しい木を育てられます</span>
      </>
    );
  } else if (day) {
    status = (
      <>
        <CareItem icon={Droplets} label="水やり" care={waterCare(day)} />
        {/* 「リスニング」だと「今日はたっぷり」の日に幅 360〜390 の画面で折り返す。
            /tree の行見出し「プログラムを聴く」を縮めた「聴く」で1行に収める。 */}
        <CareItem icon={Headphones} label="聴く" care={listenCare(day)} />
      </>
    );
  }

  return (
    <Link
      href="/tree"
      className="block bg-surface border border-surface-border rounded-3xl p-4 neu-raised active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="flex items-center gap-2 min-h-7">
        <TreeDeciduous size={18} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="flex-1 text-sm text-text-secondary">Sync Tree</span>
        {ready && (
          <span className="text-lg font-bold text-text-primary">{treeStage(fold.points).name}</span>
        )}
        <ChevronRight size={20} className="shrink-0 text-text-muted" aria-hidden="true" />
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 min-h-6 text-sm">
        {status}
      </span>
    </Link>
  );
}
