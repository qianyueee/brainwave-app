/**
 * 施術前・施術中・施術後——Sync Report「測定の比較」の AI 比較分析で、選んだ測定を
 * 施術（セッション）のどの時点の測定として比べるか。
 *
 * 1. 測った人が選んだ「施術のタイミング」（記録の treatmentPhase。測り終えたダイアログ・
 *    10秒チェックの結果・ヒストリーの記録カードで選ぶ）があれば、それがいちばん確か。
 * 2. 選んでいない回（この項目より前の記録も）は、測定中にプレーヤーに節目（プログラム）が
 *    入っていたかで推し量る（記録の playback、lib/mind/measurement-playback.ts）：
 *      - 施術前＝プログラムを流さずに測った回（測定のあいだ一度も入っていない）
 *      - 施術中＝プログラムを流しながら測った回（測定の半分以上で入っていて、主に再生）
 *      - 施術後＝プログラムを一時停止したまま測った回（半分以上入っていて、主に一時停止——
 *        聴いたあと一時停止したまま測るのが、選ばずに測るときのいちばん素直な「施術後」）
 *      - 分からない＝途中だけ流した回・playback の無い回（それより前の記録・アップロード）
 *    流し終えて（プレーヤーが空になって）から測った回は「流していない」と記録されるので、
 *    推し量ると施術前になってしまう。本当の時点は選んでもらうしかない——これが 1. を足した理由。
 *    （以前は「入っていた回」を再生・一時停止の別なく施術後と読んでいた。施術中を選べる
 *    ようになったので、流しながら測った回は施術中と読む。）
 *
 * 組み合わせ（treatmentPairs）：施術中・施術後の測定それぞれに、同じ人の、それより前で
 * いちばん新しい施術前を合わせる（施術前と比べた変化）。施術前が無い施術後だけは、同じ人の、
 * それより前でいちばん新しい施術中と合わせる。後から測った施術前とは組まない。
 *
 *   施術前→施術中→施術後 の3件 … 施術前→施術中、施術前→施術後
 *   施術前→施術後 / 施術前→施術中 … その1組
 *   施術中→施術後 … その1組
 *
 * サーバー（supabase/functions/analyze-brain/index.ts の同名の関数）が同じ決まりで組を作って
 * AI に施術による変化をまとめてもらい、組を保存する。画面はこちらで、分析の前に「施術による
 * 変化もまとめます」と伝える。決まりを変えるときは両方を直す（`pnpm check:analysis` が2つを
 * 突き合わせる）。型以外 import しない（node が直接読む）。
 */

/** 施術のタイミング。記録の treatmentPhase と比較分析に送る phase に同じ値で入る。 */
export type TreatmentPhase = "before" | "during" | "after";

/** 早い順。 */
export const TREATMENT_PHASES: readonly TreatmentPhase[] = ["before", "during", "after"];

/**
 * 保存されていた値を確かめる。知らない値・無い値は undefined＝選んでいない。記録は
 * アカウント（JSONB）と端末の localStorage から読むので、使う前に1回通す。
 */
export function readTreatmentPhase(v: unknown): TreatmentPhase | undefined {
  return v === "before" || v === "during" || v === "after" ? v : undefined;
}

/** 測定中のプレーヤー（秒、全節目の合計）。比較分析に送る形と同じ。 */
export interface ProgramSeconds {
  /** 節目を再生していた秒。 */
  playingSec: number;
  /** 節目が入ったまま一時停止していた秒。 */
  pausedSec: number;
  /** 何も入っていなかった秒。 */
  noneSec: number;
}

/**
 * none＝流していない／partly＝測定の半分未満だけ入っていた／playing・paused＝半分以上
 * 入っていて、再生と一時停止の長い方。null＝分からない。
 */
export type ProgramState = "none" | "partly" | "playing" | "paused";

export function programState(p: ProgramSeconds | null): ProgramState | null {
  if (!p) return null;
  const loaded = p.playingSec + p.pausedSec;
  if (loaded + p.noneSec <= 0) return null;
  if (loaded <= 0) return "none";
  if (loaded < p.noneSec) return "partly";
  return p.playingSec >= p.pausedSec ? "playing" : "paused";
}

/** プレーヤーの状態から推し量った時点（施術のタイミングを選んでいない回のため）。 */
export function inferredPhase(p: ProgramSeconds | null): TreatmentPhase | null {
  const s = programState(p);
  return s === "none" ? "before" : s === "playing" ? "during" : s === "paused" ? "after" : null;
}

/** 比べるときの時点：選んだ時点、選んでいなければ推し量った時点。null＝分からない。 */
export function treatmentPhaseOf(m: {
  phase: TreatmentPhase | null;
  program: ProgramSeconds | null;
}): TreatmentPhase | null {
  return m.phase ?? inferredPhase(m.program);
}

/**
 * 施術の時点どうしの組（[早い時点の位置, 遅い時点の位置]）。`ms` は古い順、`person` は
 * 比較分析に送る測定者の番号（同じ番号＝同じ人）。`phase` は選んだ時点（無ければ null）。
 */
export function treatmentPairs(
  ms: readonly { phase: TreatmentPhase | null; program: ProgramSeconds | null; person: number }[]
): [number, number][] {
  const phases = ms.map(treatmentPhaseOf);
  /** j より前で、同じ人の、いちばん新しい `want` の位置（無ければ -1）。 */
  const latest = (j: number, want: TreatmentPhase) => {
    for (let i = j - 1; i >= 0; i--) {
      if (phases[i] === want && ms[i].person === ms[j].person) return i;
    }
    return -1;
  };
  const pairs: [number, number][] = [];
  phases.forEach((p, j) => {
    if (p !== "during" && p !== "after") return;
    let i = latest(j, "before");
    if (i < 0 && p === "after") i = latest(j, "during");
    if (i >= 0) pairs.push([i, j]);
  });
  return pairs;
}
