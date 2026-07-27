import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Who a measurement was taken on. One headset is often shared — a clinic, a
 * family, a demo table — and mixing several people's recordings into one
 * history makes every average and trend meaningless.
 *
 * Kept separate from useMindStore (which owns the live stream) and persisted in
 * plain localStorage alongside it, so a subject list survives without an
 * account, exactly like the sessions it labels.
 */
export interface Subject {
  id: string;
  name: string;
  createdAt: string;
}

/** Seeded on first use so existing installs keep recording without a setup step. */
export const DEFAULT_SUBJECT_NAME = "自分";

export const SUBJECT_NAME_MAX = 20;

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

interface SubjectState {
  subjects: Subject[];
  activeSubjectId: string | null;

  /** Create the default subject when the list is empty. Safe to call repeatedly. */
  ensureDefaultSubject: () => void;
  /** Adds and selects the new subject. Returns null for a blank or duplicate name. */
  addSubject: (name: string) => Subject | null;
  renameSubject: (id: string, name: string) => void;
  /** Past recordings keep their own copy of the name, so they are not orphaned. */
  deleteSubject: (id: string) => void;
  setActiveSubject: (id: string) => void;
}

export const useSubjectStore = create<SubjectState>()(
  persist(
    (set, get) => ({
      subjects: [],
      activeSubjectId: null,

      ensureDefaultSubject: () => {
        const { subjects, activeSubjectId } = get();
        if (subjects.length === 0) {
          const first: Subject = {
            id: generateId(),
            name: DEFAULT_SUBJECT_NAME,
            createdAt: new Date().toISOString(),
          };
          set({ subjects: [first], activeSubjectId: first.id });
          return;
        }
        // A stored selection can point at a subject that was since deleted.
        if (!subjects.some((s) => s.id === activeSubjectId)) {
          set({ activeSubjectId: subjects[0].id });
        }
      },

      addSubject: (name) => {
        const trimmed = name.trim().slice(0, SUBJECT_NAME_MAX);
        if (!trimmed) return null;
        const { subjects } = get();
        const existing = subjects.find((s) => s.name === trimmed);
        if (existing) {
          // Selecting the existing one beats silently creating a second "田中".
          set({ activeSubjectId: existing.id });
          return null;
        }
        const subject: Subject = {
          id: generateId(),
          name: trimmed,
          createdAt: new Date().toISOString(),
        };
        set({ subjects: [...subjects, subject], activeSubjectId: subject.id });
        return subject;
      },

      renameSubject: (id, name) => {
        const trimmed = name.trim().slice(0, SUBJECT_NAME_MAX);
        if (!trimmed) return;
        set((state) => ({
          subjects: state.subjects.map((s) => (s.id === id ? { ...s, name: trimmed } : s)),
        }));
      },

      deleteSubject: (id) => {
        const next = get().subjects.filter((s) => s.id !== id);
        set({
          subjects: next,
          activeSubjectId:
            get().activeSubjectId === id ? (next[0]?.id ?? null) : get().activeSubjectId,
        });
      },

      setActiveSubject: (id) => {
        if (get().subjects.some((s) => s.id === id)) set({ activeSubjectId: id });
      },
    }),
    {
      name: "mind-subjects",
      partialize: (state) => ({
        subjects: state.subjects,
        activeSubjectId: state.activeSubjectId,
      }),
    }
  )
);

/** The selected subject, or null before the store has been seeded/hydrated. */
export function activeSubject(state: SubjectState): Subject | null {
  return state.subjects.find((s) => s.id === state.activeSubjectId) ?? null;
}
