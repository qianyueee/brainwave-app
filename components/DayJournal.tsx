"use client";

import { useState } from "react";
import { Pencil, Trash2, NotebookPen } from "lucide-react";
import { JOURNAL_TEXT_MAX, MOOD_SCALE, moodColor, moodStep } from "@/lib/journal";
import { useJournalStore } from "@/store/useJournalStore";

/**
 * カレンダーで選んだ日の「振り返り」。調子（5段階）と自由記述を1件だけ持ち、
 * 書き直すと上書きされる。
 *
 * 記録の一覧の**下**に置く。上に置くと、その日に何をしたかを見る前に書く欄が
 * 来てしまう——振り返りは記録を見てから書くもの。
 *
 * persist ストアを初回描画で読むと SSR と食い違うが、この成分はカレンダーの
 * 日付をタップしないと描画されない＝必ず hydration の後なので、そのまま読める。
 */
export default function DayJournal({ dayKey }: { dayKey: string }) {
  const entry = useJournalStore((s) => s.entries[dayKey]);
  const saveEntry = useJournalStore((s) => s.saveEntry);
  const removeEntry = useJournalStore((s) => s.removeEntry);

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [mood, setMood] = useState<number | null>(null);

  const startEditing = () => {
    setText(entry?.text ?? "");
    setMood(entry?.mood ?? null);
    setEditing(true);
  };

  const commit = () => {
    saveEntry(dayKey, { text, mood });
    setEditing(false);
  };

  const step = moodStep(entry?.mood);

  if (!editing) {
    return (
      <div className="pt-3 border-t border-surface-border flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-text-secondary flex items-center gap-1.5">
            <NotebookPen size={16} strokeWidth={1.5} />
            この日の振り返り
          </p>
          {entry && (
            <div className="flex items-center">
              <button
                onClick={startEditing}
                aria-label="振り返りを編集"
                className="w-12 h-12 -my-2 flex items-center justify-center text-text-muted active:scale-95"
              >
                <Pencil size={18} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => removeEntry(dayKey)}
                aria-label="振り返りを削除"
                className="w-12 h-12 -my-2 flex items-center justify-center text-danger active:scale-95"
              >
                <Trash2 size={18} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>

        {entry ? (
          <div className="flex flex-col gap-1.5">
            {step && (
              <p className="text-base font-bold flex items-center gap-2" style={{ color: moodColor(step.value) }}>
                <span aria-hidden>{step.emoji}</span>
                {step.label}
              </p>
            )}
            {/* 改行を保つ（箇条書きで書く人がいる）。長文は折り返す。 */}
            {entry.text && (
              <p className="text-base text-text-primary whitespace-pre-wrap break-words">
                {entry.text}
              </p>
            )}
          </div>
        ) : (
          <button
            onClick={startEditing}
            className="w-full min-h-12 px-4 rounded-2xl bg-navy text-base text-text-secondary neu-raised-sm neu-press transition-transform flex items-center justify-center gap-2"
          >
            <Pencil size={18} strokeWidth={1.5} />
            この日の振り返りを書く
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="pt-3 border-t border-surface-border flex flex-col gap-3">
      <p className="text-sm text-text-secondary flex items-center gap-1.5">
        <NotebookPen size={16} strokeWidth={1.5} />
        この日の振り返り
      </p>

      {/* 調子。押すと選択、もう一度押すと解除（調子は必須ではない）。 */}
      <div role="group" aria-label="この日の調子" className="grid grid-cols-5 gap-1.5">
        {MOOD_SCALE.map((m) => {
          const isOn = mood === m.value;
          return (
            <button
              key={m.value}
              onClick={() => setMood(isOn ? null : m.value)}
              aria-pressed={isOn}
              className={`min-h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isOn ? "bg-primary text-on-primary" : "bg-navy text-text-secondary neu-raised-sm"
              }`}
            >
              <span className="text-xl leading-none" aria-hidden>
                {m.emoji}
              </span>
              <span className="text-xs leading-tight">{m.label}</span>
            </button>
          );
        })}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, JOURNAL_TEXT_MAX))}
        rows={4}
        aria-label="この日の振り返り"
        placeholder="今日はどうでしたか。気づいたこと、体の感じ、聴いた音の効きなど"
        className="w-full px-4 py-3 rounded-2xl bg-navy text-text-primary text-base border border-surface-border focus:outline-none focus:border-primary resize-y"
      />
      <p className="text-xs text-text-muted text-right tabular-nums">
        {text.length} / {JOURNAL_TEXT_MAX}
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => setEditing(false)}
          className="flex-1 min-h-12 rounded-2xl bg-navy text-base text-text-secondary neu-raised-sm neu-press transition-transform"
        >
          キャンセル
        </button>
        <button
          onClick={commit}
          className="flex-1 min-h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-press transition-transform"
        >
          保存
        </button>
      </div>
    </div>
  );
}
