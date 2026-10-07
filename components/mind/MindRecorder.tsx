"use client";

import { useEffect, useState } from "react";
import { Play, Square, X } from "lucide-react";
import { useMindStore, canReceiveData, type MindSessionSummary } from "@/store/useMindStore";
import { useImportSession } from "./useImportSession";
import { sessionLabel } from "@/lib/mind/session-record";
import { syncNoteFromSession } from "@/lib/mind/note-sync";
import { formatTime } from "@/lib/utils";
import { isLowQuality, signalQualityPct } from "@/lib/brain-profile";
import { useSubjectStore, activeSubject } from "@/store/useSubjectStore";
import { useCloudSyncStore } from "@/store/useCloudSyncStore";
import { subjectDisplayName } from "@/lib/subject-groups";
import { DEFAULT_TARGET_HZ, formatTargetHz } from "@/lib/mind/resonance";
import { useLocale, useT } from "@/lib/i18n";
import CloudSaveStatus from "./CloudSaveStatus";

/**
 * Record start/stop button for the mind-map top bar. When a measurement
 * finishes, a dialog shows its summary and a memo field, then:
 *
 * - `mode="import"`（/brain）：この測定を脳特性チャートに取り込むかを尋ねる。
 * - `mode="autoSave"`（デスクトップ測定アプリ /desktop）：尋ねない。測り終えた
 *   時点のアカウント宛てに記録へ印を付け、裏の送信箱（lib/sync/outbox.ts）が
 *   送る。ダイアログはその状態（保存中→保存しました）を見せて「閉じる」だけ。
 *   未ログインなら「ログインして保存」。/report は単体アプリに無いので遷移しない。
 *
 * メモは dismiss 経由なのでどちらでも保存される（autoSave では版が進み、書いた
 * メモ付きでもう一度送られる）。
 */
export default function MindRecorder({ mode = "import" }: { mode?: "import" | "autoSave" }) {
  const t = useT();
  const locale = useLocale();
  const allowImport = mode === "import";
  const isRecording = useMindStore((s) => s.isRecording);
  const recordingSamples = useMindStore((s) => s.recordingSamples);
  const startRecording = useMindStore((s) => s.startRecording);
  const stopRecording = useMindStore((s) => s.stopRecording);

  const subject = useSubjectStore(activeSubject);

  // The just-finished measurement awaiting the import decision.
  const [finished, setFinished] = useState<MindSessionSummary | null>(null);
  /** 任意メモ。空欄なら既定（日時ラベル）のまま。 */
  const [note, setNote] = useState("");
  const { importSession, statusFor } = useImportSession();

  /**
   * メモは測定そのものに属するので、取り込むかどうかとは無関係に残す——
   * 「あとで」で閉じてもタイプした一文が消えないように、どの出口からでも書く。
   * 空欄のときは書かない：既定に戻すのではなく、既存のメモを空で上書きして
   * 消してしまわないため。
   */
  const commitNote = (s: MindSessionSummary) => {
    const trimmed = note.trim();
    if (trimmed) syncNoteFromSession({ id: s.id, startedAt: s.startedAt }, trimmed);
    return trimmed;
  };

  /** ダイアログを閉じる全経路の共通出口（× / 背景タップ / Esc / あとで）。 */
  const dismiss = () => {
    if (finished) commitNote(finished);
    setFinished(null);
  };

  // Realtime needs an online bridge actually sending data; demo is self-feeding.
  const canReceive = useMindStore(canReceiveData);

  const handleToggle = () => {
    if (!isRecording) {
      // Stamped at start, not at stop, so switching subjects mid-run cannot
      // relabel a measurement that is already underway.
      startRecording(subject && { id: subject.id, name: subject.name });
      return;
    }
    // 自動保存：この端末が結びついているアカウント宛て（オフライン起動で
    // ログインが一時的に切れていても宛先は決まる。送るのは後でよい）。
    const summary = stopRecording(
      mode === "autoSave"
        ? { cloudOwner: useCloudSyncStore.getState().account?.id }
        : undefined
    );
    // Show the result whenever something was recorded — including a measurement
    // the headset never read, which the dialog explains instead of offering an
    // all-zero import.
    if (summary) {
      setNote(summary.note ?? "");
      setFinished(summary);
    }
  };

  // Lock body scroll + Escape to close while the dialog is open.
  useEffect(() => {
    if (!finished) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const trimmed = note.trim();
        if (trimmed)
          syncNoteFromSession({ id: finished.id, startedAt: finished.startedAt }, trimmed);
        setFinished(null);
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [finished, note]);

  const importStatus = finished ? statusFor(finished.id) : "idle";
  // Older sessions predate usableSec; treat them as usable so nothing regresses.
  const usableSec = finished?.usableSec ?? finished?.durationSec ?? 0;
  const unusable = !!finished && usableSec === 0;
  // Enough seconds were lost to poor contact that the scores are worth a caveat.
  // Same threshold the stored record and the 過去の測定 list use.
  const qualityPct = finished
    ? signalQualityPct(usableSec, finished.durationSec)
    : undefined;
  const patchy = !!finished && !unusable && isLowQuality(qualityPct);

  return (
    <>
      {/* 主色のベタ塗りは「接続する」に譲り、こちらは輪郭ボタン。同じ画面に
          塗りボタンが2つ並ぶと、先に押すべきものが読めなくなる——接続が先、
          測定が次、という順番をボタンの重さで示している。測定中だけは
          ベタ塗りの赤で、いま録れていることを最優先で見せる。 */}
      <button
        onClick={handleToggle}
        disabled={!isRecording && !canReceive}
        className={`w-full flex items-center justify-center gap-2 min-h-[52px] rounded-2xl text-lg font-bold border transition-colors ${
          isRecording
            ? "bg-red-500/85 text-white border-transparent neu-press"
            : canReceive
              ? "bg-surface text-primary border-primary neu-raised-sm neu-press"
              : "bg-surface text-text-muted border-surface-border neu-raised-sm opacity-60"
        }`}
      >
        {isRecording ? (
          <>
            <Square size={20} fill="currentColor" />
            {t(
              `測定を終了（${formatTime(recordingSamples.length)}）`,
              `Stop measuring (${formatTime(recordingSamples.length)})`
            )}
          </>
        ) : (
          <>
            <Play size={20} strokeWidth={2} />
            {t("測定を開始", "Start measuring")}
          </>
        )}
      </button>

      {/* Post-measurement prompt: import this measurement into 脳特性? */}
      {finished && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={dismiss}
          role="button"
          aria-label={t("閉じる", "Close")}
        >
          <div
            className="w-full max-w-[420px] mx-4 max-h-[85vh] overflow-y-auto bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-4 neu-raised-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">
                {unusable
                  ? t("測定できませんでした", "Measurement failed")
                  : t("測定が完了しました", "Measurement complete")}
              </h2>
              <button
                onClick={dismiss}
                aria-label={t("閉じる", "Close")}
                className="w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
              >
                <X size={20} />
              </button>
            </div>

            {unusable ? (
              <>
                <p className="text-base text-text-secondary">
                  {t(
                    `測定時間 ${formatTime(finished.durationSec)}`,
                    `Duration ${formatTime(finished.durationSec)}`
                  )}
                </p>
                <p className="text-base text-text-primary">
                  {t(
                    "ヘッドセットが脳波を読み取れませんでした。電極が額に密着しているか、 電源が入っているかをご確認のうえ、もう一度お試しください。",
                    "The headset couldn't read your brainwaves. Please check that the sensor is resting firmly on your forehead and that the headset is turned on, then try again."
                  )}
                </p>
                <p className="text-sm text-text-muted">
                  {t(
                    "この測定は記録されません（有効なデータが0秒のため）",
                    "This measurement won't be saved (no usable data was recorded)"
                  )}
                </p>
              </>
            ) : (
              <>
                {finished.subjectName && (
                  <p className="text-base text-text-primary font-bold">
                    {t(
                      `測定者: ${subjectDisplayName(finished.subjectName, locale)}`,
                      `Person: ${subjectDisplayName(finished.subjectName, locale)}`
                    )}
                  </p>
                )}
                <p className="text-base text-text-secondary">
                  {t(
                    `測定時間 ${formatTime(finished.durationSec)}・集中 ${finished.avgAttention}・リラックス ${finished.avgMeditation}・ゾーン率 ${finished.flowRatioPct}%`,
                    `Duration ${formatTime(finished.durationSec)} · Focus ${finished.avgAttention} · Relaxation ${finished.avgMeditation} · Time in zone ${finished.flowRatioPct}%`
                  )}
                </p>
                {/* Rate の共鳴率をどの Hz で見るか。測定中にいちばん長く流れていた
                    セッションの誘導周波数、無ければ既定（lib/mind/session-target.ts）。 */}
                <p className="text-sm text-text-secondary">
                  {finished.targetHz != null
                    ? t(
                        `誘導周波数 ${formatTargetHz(finished.targetHz)}Hz（測定中に流していたセッション）`,
                        `Target frequency ${formatTargetHz(finished.targetHz)} Hz (from the session you were playing)`
                      )
                    : t(
                        `誘導周波数 ${formatTargetHz(DEFAULT_TARGET_HZ)}Hz（既定）`,
                        `Target frequency ${formatTargetHz(DEFAULT_TARGET_HZ)} Hz (default)`
                      )}
                </p>

                {patchy && (
                  <p className="text-sm text-warning">
                    {t(
                      `有効なデータは ${formatTime(usableSec)}（${qualityPct}%）でした。 装着が不安定だったため、スコアは目安としてご覧ください`,
                      `Usable data: ${formatTime(usableSec)} (${qualityPct}%). The headset wasn't sitting steadily, so please treat the scores as a rough guide`
                    )}
                  </p>
                )}

                {/* 任意メモ。測定直後にしか思い出せないこと（何をした後か、
                    体調、場所）を、記録と同じ画面で残せるようにする。入れて
                    おくと「過去の測定」の一覧がこの一文で並ぶので、日時だけの
                    リストから目当ての回を探さずに済む。 */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="measurement-note"
                    className="text-sm text-text-secondary"
                  >
                    {t("メモ（任意）", "Note (optional)")}
                  </label>
                  <input
                    id="measurement-note"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t(
                      "例：朝いちばん／会議のあと",
                      "e.g. first thing in the morning / after a meeting"
                    )}
                    maxLength={60}
                    className="w-full bg-navy rounded-2xl px-4 min-h-[52px] text-base text-text-primary placeholder:text-text-muted outline-none neu-inset focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-xs text-text-muted">
                    {t(
                      `未入力なら日時（${sessionLabel(finished, locale)}）で記録されます`,
                      `If left blank, it will be labeled with the date and time (${sessionLabel(finished, locale)})`
                    )}
                  </p>
                </div>

                {allowImport && (
                  <p className="text-base text-text-primary">
                    {t(
                      "この測定結果を脳特性チャートに取り込みますか？",
                      "Import this result into your Brain profile chart?"
                    )}
                  </p>
                )}
              </>
            )}

            {!allowImport && !unusable && <CloudSaveStatus kind="session" id={finished.id} />}

            {allowImport && !unusable && importStatus === "waitingLogin" && (
              <p className="text-sm text-text-muted">
                {t("ログインすると自動で取り込まれます", "It will be imported automatically once you log in")}
              </p>
            )}
            {allowImport && !unusable && importStatus === "waitingCloud" && (
              <p className="text-sm text-text-muted">
                {t("データの同期を待っています…", "Waiting for your data to sync…")}
              </p>
            )}
            {allowImport && !unusable && importStatus === "error" && (
              <p className="text-sm text-danger">
                {t(
                  "取り込みに失敗しました。通信環境をご確認のうえ、もう一度お試しください",
                  "Import failed. Please check your internet connection and try again"
                )}
              </p>
            )}

            {unusable ? (
              <button
                onClick={() => setFinished(null)}
                className="min-h-[52px] rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform"
              >
                {t("閉じる", "Close")}
              </button>
            ) : !allowImport ? (
              /* dismiss 経由でメモを確定してから閉じる（自動保存版：書いたメモは版が
                 進んで、もう一度アカウントへ送られる）。 */
              <button
                onClick={dismiss}
                className="min-h-[52px] rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform"
              >
                {t("閉じる", "Close")}
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={dismiss}
                  className="flex-1 min-h-[52px] rounded-2xl bg-navy text-text-secondary text-base font-bold neu-raised-sm neu-press transition-transform"
                >
                  {t("あとで", "Later")}
                </button>
                <button
                  onClick={() => {
                    // メモを先に確定してから取り込む。取り込み先（脳特性）は
                    // note をコピーして持つので、順序が逆だとメモ無しの
                    // レコードが出来上がる。
                    const trimmed = commitNote(finished);
                    importSession({ ...finished, note: trimmed || finished.note });
                  }}
                  disabled={importStatus === "busy" || importStatus === "waitingCloud"}
                  className="flex-1 min-h-[52px] rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press transition-transform disabled:opacity-60"
                >
                  {importStatus === "busy" ? t("取り込み中…", "Importing…") : t("取り込む", "Import")}
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
}
