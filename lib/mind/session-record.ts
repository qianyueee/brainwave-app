import type { MindSessionSummary } from "@/store/useMindStore";
import { signalQualityPct, type BrainProfile } from "@/lib/brain-profile";

/** 測定の既定ラベル（メモが無いときの見出し）。例：「9月27日 17:50」。 */
export function sessionLabel(s: Pick<MindSessionSummary, "startedAt">): string {
  return new Date(s.startedAt).toLocaleString("ja-JP", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 測定セッション → 脳特性の記録のキー。測定の開始時刻で、どの端末から送っても同じ値になる。 */
export function measurementKey(s: Pick<MindSessionSummary, "startedAt">): string {
  return new Date(s.startedAt).toISOString();
}

/**
 * 測定セッションを脳特性の記録（BrainProfile）にする。/brain の「取り込む」と
 * デスクトップ測定アプリの自動保存が同じこの1本を通る——どちらから入った記録も
 * レポート・ヒストリーで同じに見えるように。6指標などは測定終了時に計算済みの
 * 値を写すだけで、ここでは何も計算し直さない。
 *
 * 6指標が無いのは、この機能より前に保存された古いセッションだけ（null を返す）。
 */
export function measurementFromSession(s: MindSessionSummary): BrainProfile | null {
  if (!s.indicators || !s.bands) return null;
  return {
    indicators: s.indicators,
    bands: s.bands,
    spectrum: s.spectrum,
    note: s.note,
    uploadedAt: measurementKey(s),
    sessionTag: sessionLabel(s),
    // 記録と一緒に運ぶ：脳特性チャートは測定直後のダイアログよりずっと後まで
    // 見られるので、接触不良の注記がそこで途切れないように。
    qualityPct: signalQualityPct(s.usableSec, s.durationSec),
    // 同じく誰を測ったか——無いと、ヘッドセットを着けた全員の記録が1本の
    // 推移に混ざる。
    subject: s.subjectName,
    // Rate の共鳴率をどの周波数で見るかは測定ごとの条件（無ければ既定の 40Hz）。
    targetHz: s.targetHz,
  };
}
