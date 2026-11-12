/**
 * 施術前・施術後——Sync Report「測定の比較」の AI 比較分析で、選んだ測定のどれを
 * 「施術前」、どれを「施術後」として比べるか。測定中にプレーヤーに節目（プログラム）が
 * 入っていたかで決める（記録の playback、lib/mind/measurement-playback.ts）：
 *
 *   - 施術前＝プログラムを流さずに測った回（測定のあいだ一度も入っていない）
 *   - 施術後＝プログラムを流しながら測った回（測定の半分以上で入っていた。一時停止中も
 *     含む——聴いたあと一時停止したまま測るのが、いちばん素直な「施術後」の測り方）
 *   - どちらでもない＝途中だけ流した回・分からない回（playback より前の記録・アップロード）
 *
 * 「施術後」は一覧の「♪X」（mainProgram）が付く回と同じ。
 *
 * 施術後の測定それぞれに、同じ人の、それより前でいちばん新しい施術前の測定を組み合わせる。
 * 施術前が施術後より後なら組まない——プログラムを最後まで流し終えて（プレーヤーが空に
 * なって）から測ると「流していない」と記録されるので、それを施術前と読まないため。
 *
 * サーバー（supabase/functions/analyze-brain/index.ts の programState / beforeAfterPairs）が
 * 同じ決まりで組を作って AI に施術前後の比較を頼み、組を保存する。画面はこちらで、分析の
 * 前に「施術前と施術後もまとめます」と伝える。決まりを変えるときは両方を直す
 * （`pnpm check:analysis` が2つを突き合わせる）。型以外 import しない。
 */

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

export type BeforeAfterRole = "before" | "after";

export function beforeAfterRole(p: ProgramSeconds | null): BeforeAfterRole | null {
  const s = programState(p);
  return s === "none" ? "before" : s === "playing" || s === "paused" ? "after" : null;
}

/**
 * 施術前と施術後の組（[施術前の位置, 施術後の位置]）。`ms` は古い順、`person` は
 * 比較分析に送る測定者の番号（同じ番号＝同じ人）。
 */
export function beforeAfterPairs(
  ms: readonly { program: ProgramSeconds | null; person: number }[]
): [number, number][] {
  const roles = ms.map((m) => beforeAfterRole(m.program));
  const pairs: [number, number][] = [];
  ms.forEach((m, j) => {
    if (roles[j] !== "after") return;
    for (let i = j - 1; i >= 0; i--) {
      if (roles[i] === "before" && ms[i].person === m.person) {
        pairs.push([i, j]);
        return;
      }
    }
  });
  return pairs;
}
