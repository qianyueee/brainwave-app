/**
 * Grouping records (mind-map sessions / 脳特性 measurements) by who they were
 * measured on, for the two-step 測定者 → 記録 pickers on Sync Brain and
 * Sync History.
 *
 * Dependency-free pure functions: the two lists store the subject differently
 * (a session keeps `subjectId` + `subjectName`, a measurement keeps only the
 * name so it stays readable after a rename), so each caller maps its own shape
 * onto `{ key, name }` and the grouping logic is shared.
 */

/** Sentinel dropdown value for "everyone" — shown only when 2+ people appear. */
export const ALL_SUBJECTS = "__all__";

/** Group key for records with no subject: uploads, and pre-subject recordings. */
export const NO_SUBJECT = "__none__";

export const NO_SUBJECT_NAME = "測定者未設定";

export interface SubjectGroup {
  /** Dropdown option value: the subject's id (sessions) or name (measurements). */
  key: string;
  name: string;
  count: number;
}

/** The subject a record belongs to, as the caller sees it. */
export interface SubjectRef {
  key?: string;
  name?: string;
}

/**
 * One group per person, in the order they are first met — pass the records
 * newest-first and the most recently measured person leads the dropdown.
 */
export function subjectGroups<T>(
  records: T[],
  subjectOf: (record: T) => SubjectRef
): SubjectGroup[] {
  const groups: SubjectGroup[] = [];
  const byKey = new Map<string, SubjectGroup>();
  for (const record of records) {
    const { key, name } = subjectOf(record);
    const groupKey = key || NO_SUBJECT;
    const existing = byKey.get(groupKey);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const group: SubjectGroup = {
      key: groupKey,
      name: name?.trim() || NO_SUBJECT_NAME,
      count: 1,
    };
    byKey.set(groupKey, group);
    groups.push(group);
  }
  return groups;
}

/** Does this record belong to the selected group? ALL_SUBJECTS matches every one. */
export function matchesSubject(subject: SubjectRef, groupKey: string): boolean {
  if (groupKey === ALL_SUBJECTS) return true;
  return (subject.key || NO_SUBJECT) === groupKey;
}

/**
 * Which group the picker should land on: the one being measured right now if
 * they have records, otherwise whoever was measured most recently. Returns null
 * when there is nothing to show.
 *
 * `groups` must come from `subjectGroups` on newest-first records, so groups[0]
 * is the most recent person.
 */
export function defaultSubjectKey(
  groups: SubjectGroup[],
  activeKey: string | null | undefined
): string | null {
  if (activeKey && groups.some((g) => g.key === activeKey)) return activeKey;
  return groups[0]?.key ?? null;
}

/**
 * Resolves the stored picker selection against the groups that actually exist,
 * so a subject that was deleted (or whose records were) falls back instead of
 * showing an empty list.
 */
export function resolveSubjectKey(
  selected: string | null,
  groups: SubjectGroup[],
  activeKey: string | null | undefined
): string | null {
  if (selected === ALL_SUBJECTS && groups.length > 1) return ALL_SUBJECTS;
  if (selected && groups.some((g) => g.key === selected)) return selected;
  return defaultSubjectKey(groups, activeKey);
}
