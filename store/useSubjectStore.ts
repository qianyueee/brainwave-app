import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SUBJECT_NAME } from "@/lib/subject-groups";
import {
  ACTIVE_SUBJECT_KEY,
  useRecordView,
  useUserRecordsStore,
} from "@/store/useUserRecordsStore";
import {
  ANON_SCOPE,
  EPOCH,
  normalizeSubjectName,
  subjectKey,
  viewOf,
  type RecordMap,
  type StoredRecord,
} from "@/lib/sync/record-merge";

/**
 * Who a measurement was taken on. One headset is often shared — a clinic, a
 * family, a demo table — and mixing several people's recordings into one
 * history makes every average and trend meaningless.
 *
 * 測定者の一覧は store/useUserRecordsStore.ts（端末をまたいで同じにする記録）に
 * **名前で1件**ずつ置く——ログイン中はアカウントにも載り、Web・Android・Windows の
 * どれで測っても同じ一覧になる。どの端末にも最初からある「自分」も同じ1件に畳める
 * よう、id は名前そのもの（記録の側も名前の写しを持っていて、グループ分けは名前で
 * している——lib/subject-groups.ts）。
 *
 * 「いま誰を測っているか」だけは端末ごと（ACTIVE_SUBJECT_KEY、素の localStorage）。
 * 以前は一覧ごと素の localStorage（`mind-subjects`）で、選択は端末の id だった——
 * useUserRecordsStore が初回に名前へ直して移す。
 *
 * 形は以前の zustand ストアと同じ（`useSubjectStore((s) => s.subjects)`・
 * `useSubjectStore(activeSubject)`）。
 */
export interface Subject {
  /** 名前と同じ（端末をまたいで同じ人を指すため）。 */
  id: string;
  name: string;
  createdAt: string;
}

/**
 * Seeded on first use so existing installs keep recording without a setup step.
 * Defined next to subjectDisplayName (lib/subject-groups.ts), which shows it as
 * "Me" in English without changing the stored name.
 */
export { DEFAULT_SUBJECT_NAME };

export const SUBJECT_NAME_MAX = 20;

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

/** いま選んでいる測定者（名前）。端末ごと。 */
const useActiveSubjectStore = create<{ activeSubjectId: string | null }>()(
  persist(() => ({ activeSubjectId: null as string | null }), { name: ACTIVE_SUBJECT_KEY })
);

// 記録が変わらない限り同じ Subject を返す（ほかの種類の記録が増えても、選択中の
// 測定者のオブジェクトが入れ替わって描き直しや効果の走り直しを起こさないように）。
const subjectCache = new WeakMap<StoredRecord, Subject>();

function subjectOf(key: string, r: StoredRecord): Subject | null {
  const cached = subjectCache.get(r);
  if (cached) return cached;
  const raw = typeof r.data.name === "string" ? r.data.name : key.slice(key.indexOf(":") + 1);
  const name = normalizeSubjectName(raw);
  if (!name) return null;
  const createdAt = typeof r.data.createdAt === "string" ? r.data.createdAt : r.updatedAt;
  const subject = { id: name, name, createdAt };
  subjectCache.set(r, subject);
  return subject;
}

/** 足した順（最初からある「自分」が先頭）。 */
function subjectsOf(view: RecordMap): Subject[] {
  const out: Subject[] = [];
  for (const [key, r] of Object.entries(view)) {
    if (r.kind !== "subject") continue;
    const s = subjectOf(key, r);
    if (s) out.push(s);
  }
  return out.sort((a, b) =>
    a.createdAt === b.createdAt ? a.name.localeCompare(b.name, "ja") : a.createdAt < b.createdAt ? -1 : 1
  );
}

/** 操作の中で読む、いまの一覧（画面が見ているのと同じ重ね方）。 */
function currentSubjects(): Subject[] {
  const s = useUserRecordsStore.getState();
  return subjectsOf(
    viewOf(s.scope === ANON_SCOPE ? undefined : s.scopes[s.scope], s.scopes[ANON_SCOPE])
  );
}

const setActive = (id: string | null) => useActiveSubjectStore.setState({ activeSubjectId: id });

function ensureDefaultSubject(): void {
  const subjects = currentSubjects();
  if (subjects.length === 0) {
    const key = subjectKey(DEFAULT_SUBJECT_NAME)!;
    const records = useUserRecordsStore.getState();
    const data = { name: DEFAULT_SUBJECT_NAME, createdAt: EPOCH };
    // 別の端末で「自分」も含めて全員消された（墓標がある）なら、種では勝てないので書き直す。
    if (records.scopes[records.scope]?.[key]) records.put(key, "subject", data);
    else records.seed(key, "subject", data);
    setActive(DEFAULT_SUBJECT_NAME);
    return;
  }
  // A stored selection can point at a subject that was since deleted.
  const active = useActiveSubjectStore.getState().activeSubjectId;
  if (!subjects.some((s) => s.id === active)) setActive(subjects[0].id);
}

function addSubject(name: string): Subject | null {
  const trimmed = normalizeSubjectName(name).slice(0, SUBJECT_NAME_MAX);
  const key = trimmed ? subjectKey(trimmed) : null;
  if (!key) return null;
  const existing = currentSubjects().find((s) => s.name === trimmed);
  if (existing) {
    // Selecting the existing one beats silently creating a second "田中".
    setActive(existing.id);
    return null;
  }
  const subject: Subject = { id: trimmed, name: trimmed, createdAt: new Date().toISOString() };
  useUserRecordsStore.getState().put(key, "subject", { name: trimmed, createdAt: subject.createdAt });
  setActive(subject.id);
  return subject;
}

function renameSubject(id: string, name: string): void {
  const trimmed = normalizeSubjectName(name).slice(0, SUBJECT_NAME_MAX);
  const oldKey = subjectKey(id);
  const newKey = trimmed ? subjectKey(trimmed) : null;
  if (!oldKey || !newKey || oldKey === newKey) return;
  const records = useUserRecordsStore.getState();
  const cur = currentSubjects().find((s) => s.id === id);
  // 名前で1件なので、改名は「新しい名前を足して、古い名前を消す」。
  if (!currentSubjects().some((s) => s.name === trimmed)) {
    records.put(newKey, "subject", { name: trimmed, createdAt: cur?.createdAt ?? new Date().toISOString() });
  }
  useUserRecordsStore.getState().remove(oldKey);
  if (useActiveSubjectStore.getState().activeSubjectId === id) setActive(trimmed);
}

function deleteSubject(id: string): void {
  const key = subjectKey(id);
  if (!key) return;
  useUserRecordsStore.getState().remove(key);
  if (useActiveSubjectStore.getState().activeSubjectId === id) {
    setActive(currentSubjects()[0]?.id ?? null);
  }
}

function setActiveSubject(id: string): void {
  if (currentSubjects().some((s) => s.id === id)) setActive(id);
}

export function useSubjectStore<T>(selector: (s: SubjectState) => T): T {
  const view = useRecordView();
  const subjects = useMemo(() => subjectsOf(view), [view]);
  const stored = useActiveSubjectStore((s) => s.activeSubjectId);
  // 選んでいた人が（別の端末で）消されていたら、最初の人に落とす。
  const activeSubjectId =
    stored && subjects.some((s) => s.id === stored) ? stored : (subjects[0]?.id ?? null);
  const state = useMemo<SubjectState>(
    () => ({
      subjects,
      activeSubjectId,
      ensureDefaultSubject,
      addSubject,
      renameSubject,
      deleteSubject,
      setActiveSubject,
    }),
    [subjects, activeSubjectId]
  );
  return selector(state);
}

/** The selected subject, or null before the store has been seeded/hydrated. */
export function activeSubject(state: SubjectState): Subject | null {
  return state.subjects.find((s) => s.id === state.activeSubjectId) ?? null;
}
