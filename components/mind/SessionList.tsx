"use client";

import { useState, useSyncExternalStore } from "react";
import { Trash2, ChevronRight } from "lucide-react";
import { useMindStore } from "@/store/useMindStore";
import { useImportSession, sessionLabel, type ImportStatus } from "./useImportSession";
import { formatTime } from "@/lib/utils";

/** Default number of rows shown before the 全て toggle is pressed. */
const DEFAULT_COUNT = 4;

const subscribeNoop = () => () => {};

const STATUS_TEXT: Partial<Record<ImportStatus, string>> = {
  busy: "脳特性に取り込み中…",
  waitingLogin: "ログインすると脳特性で確認できます",
  waitingCloud: "データの同期を待っています…",
  error: "取り込みに失敗しました。もう一度お試しください",
};

/**
 * 過去の測定 list. Defaults to the latest DEFAULT_COUNT rows with a 全て toggle.
 * Tapping a row opens that measurement in the 脳特性 chart via the shared
 * useImportSession flow (login + cloud-hydrate gated, deduped by timestamp).
 */
export default function SessionList() {
  const sessions = useMindStore((s) => s.sessions);
  const deleteSession = useMindStore((s) => s.deleteSession);
  const { importSession, statusFor } = useImportSession();

  // false during SSR/hydration, true after — persisted sessions only render
  // client-side, avoiding a hydration mismatch.
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
  const [showAll, setShowAll] = useState(false);

  const visible = hydrated ? (showAll ? sessions : sessions.slice(0, DEFAULT_COUNT)) : [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-text-primary">過去の測定</h2>
        {hydrated && sessions.length > DEFAULT_COUNT && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="px-3 py-1.5 rounded-xl border border-surface-border text-sm font-medium text-primary neu-raised-sm neu-press transition-transform"
          >
            {showAll ? "閉じる" : "全て"}
          </button>
        )}
      </div>

      {!hydrated || sessions.length === 0 ? (
        <p className="text-base text-text-secondary">まだ測定記録がありません</p>
      ) : (
        visible.map((s) => {
          const status = statusFor(s.id);
          return (
            <div
              key={s.id}
              className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex items-center justify-between gap-2"
            >
              <button
                onClick={() => importSession(s)}
                disabled={status === "busy"}
                className="min-w-0 flex-1 text-left flex items-center gap-2 active:opacity-70"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-text-primary">
                    {sessionLabel(s)}
                    {s.source === "demo" && (
                      <span className="ml-2 text-xs font-normal text-text-muted">デモ</span>
                    )}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {formatTime(s.durationSec)}・集中 {s.avgAttention}・リラックス {s.avgMeditation}
                    ・ゾーン率 {s.flowRatioPct}%
                  </p>
                  {STATUS_TEXT[status] && (
                    <p
                      className={`text-xs mt-1 ${
                        status === "error"
                          ? "text-red-400"
                          : status === "busy"
                            ? "text-primary"
                            : "text-text-muted"
                      }`}
                    >
                      {STATUS_TEXT[status]}
                    </p>
                  )}
                </div>
                {s.indicators && (
                  <ChevronRight size={20} className="shrink-0 text-text-muted" />
                )}
              </button>
              <button
                onClick={() => deleteSession(s.id)}
                aria-label="削除"
                className="shrink-0 w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-muted"
              >
                <Trash2 size={20} />
              </button>
            </div>
          );
        })
      )}
    </section>
  );
}
