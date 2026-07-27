"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Plus, Trash2, User, X } from "lucide-react";
import {
  useSubjectStore,
  activeSubject,
  SUBJECT_NAME_MAX,
} from "@/store/useSubjectStore";
import { useMindStore } from "@/store/useMindStore";

const subscribeNoop = () => () => {};

/**
 * Picks who the next measurement is taken on. One headset is often shared, and
 * a shared history makes every average and trend meaningless — so the subject is
 * chosen *before* recording and stamped onto the session.
 *
 * The subject is locked while a recording runs: relabelling a measurement that
 * is already underway would silently attribute someone else's data.
 */
export default function SubjectSelector() {
  const subjects = useSubjectStore((s) => s.subjects);
  const current = useSubjectStore(activeSubject);
  const ensureDefaultSubject = useSubjectStore((s) => s.ensureDefaultSubject);
  const setActiveSubject = useSubjectStore((s) => s.setActiveSubject);
  const addSubject = useSubjectStore((s) => s.addSubject);
  const deleteSubject = useSubjectStore((s) => s.deleteSubject);
  const isRecording = useMindStore((s) => s.isRecording);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  // false during SSR/hydration, true after — the persisted subject only exists
  // client-side, so rendering its name before then is a hydration mismatch.
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );

  // Seed 自分 on first use so an existing install can still just press 測定開始.
  useEffect(() => {
    ensureDefaultSubject();
  }, [ensureDefaultSubject]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleAdd = () => {
    const created = addSubject(draft);
    // null also comes back when the name already exists — that one is selected
    // instead of duplicated, so clearing the field is right either way.
    if (created || draft.trim()) setDraft("");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={isRecording}
        className="w-full flex items-center gap-3 min-h-[56px] px-4 rounded-2xl bg-surface border border-surface-border neu-raised neu-press transition-transform text-left disabled:opacity-60 disabled:active:scale-100"
      >
        <span className="w-9 h-9 shrink-0 rounded-xl bg-navy neu-inset flex items-center justify-center text-primary">
          <User size={18} strokeWidth={1.5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-text-muted">測定者</span>
          <span className="block text-base font-bold text-text-primary truncate">
            {hydrated ? (current?.name ?? "未選択") : "…"}
          </span>
        </span>
        <span className="shrink-0 text-sm text-primary font-bold">
          {isRecording ? "測定中" : "変更"}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="測定者を選択"
            className="w-full max-w-[420px] mx-4 max-h-[80vh] overflow-y-auto bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-4 neu-raised-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">測定者を選択</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="w-10 h-10 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {subjects.map((s) => {
                const selected = s.id === current?.id;
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setActiveSubject(s.id);
                        setOpen(false);
                      }}
                      aria-pressed={selected}
                      className={`min-w-0 flex-1 flex items-center gap-2 min-h-[52px] px-4 rounded-2xl text-left transition-all active:scale-[0.98] ${
                        selected
                          ? "bg-navy-light text-primary neu-inset font-bold"
                          : "bg-navy text-text-primary neu-raised-sm"
                      }`}
                    >
                      <span className="flex-1 min-w-0 truncate text-base">{s.name}</span>
                      {selected && <Check size={18} className="shrink-0" />}
                    </button>
                    {subjects.length > 1 && (
                      <button
                        onClick={() => deleteSubject(s.id)}
                        aria-label={`${s.name}を削除`}
                        className="shrink-0 w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-muted active:text-red-400"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm text-text-secondary">新しい測定者を追加</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                  }}
                  placeholder="お名前を入力"
                  maxLength={SUBJECT_NAME_MAX}
                  className="flex-1 min-w-0 bg-navy rounded-2xl px-4 min-h-[52px] text-base text-text-primary placeholder:text-text-muted outline-none neu-inset focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleAdd}
                  disabled={!draft.trim()}
                  className="shrink-0 flex items-center gap-1 px-4 min-h-[52px] rounded-2xl bg-primary text-white text-base font-bold disabled:opacity-40 active:scale-95 neu-raised-sm"
                >
                  <Plus size={18} strokeWidth={2.5} />
                  追加
                </button>
              </div>
            </div>

            <p className="text-xs text-text-muted">
              削除しても、その方の過去の測定記録は残ります
            </p>
          </div>
        </div>
      )}
    </>
  );
}
