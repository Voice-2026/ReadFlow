import type {
  Learner,
  TranslationRecord,
  VocabularyItem,
  VocabularyState,
  VocabularySuggestion,
  VocabularyCandidate,
  ReadingAttempt,
  LearningProfile,
} from "../../shared/types";

const LEARNERS_KEY = "readflow.learners";
const ACTIVE_LEARNER_KEY = "readflow.activeLearner";

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function createDefaultLearner(): Learner {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "我的学习档案",
    avatar: "我",
    goals: ["优先提升英文阅读理解"],
    interests: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function loadLearners(): Learner[] {
  const learners = readJson<Learner[]>(LEARNERS_KEY, []);
  if (learners.length > 0) return learners;

  const initialLearner = createDefaultLearner();
  writeJson(LEARNERS_KEY, [initialLearner]);
  window.localStorage.setItem(ACTIVE_LEARNER_KEY, initialLearner.id);
  return [initialLearner];
}

export function saveLearners(learners: Learner[]): void {
  writeJson(LEARNERS_KEY, learners);
}

export function loadActiveLearnerId(): string | null {
  return window.localStorage.getItem(ACTIVE_LEARNER_KEY);
}

export function saveActiveLearnerId(learnerId: string): void {
  window.localStorage.setItem(ACTIVE_LEARNER_KEY, learnerId);
}

export function createLearner(name: string, goal?: string): Learner {
  const trimmedName = name.trim();
  const trimmedGoal = goal?.trim();
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: trimmedName,
    avatar: trimmedName.slice(0, 1) || "学",
    goals: trimmedGoal ? [trimmedGoal] : [],
    interests: [],
    createdAt: now,
    updatedAt: now,
  };
}

function vocabularyKey(learnerId: string): string {
  return `readflow.learner.${learnerId}.vocabulary`;
}

export function loadVocabulary(learnerId: string): VocabularyItem[] {
  return readJson<VocabularyItem[]>(vocabularyKey(learnerId), []).map(normalizeVocabularyItem);
}

export function saveVocabulary(learnerId: string, items: VocabularyItem[]): void {
  const invalidItem = items.find((item) => item.learnerId !== learnerId);
  if (invalidItem) {
    throw new Error("检测到跨学习者的单词记录，已拒绝保存");
  }
  writeJson(vocabularyKey(learnerId), items);
}

export function confirmVocabularySuggestion(
  learnerId: string,
  suggestion: VocabularySuggestion,
  state: VocabularyState,
): VocabularyItem[] {
  const items = loadVocabulary(learnerId);
  const normalizedTerm = suggestion.term.trim().toLocaleLowerCase();
  const existingIndex = items.findIndex(
    (item) => item.term.trim().toLocaleLowerCase() === normalizedTerm,
  );
  const now = new Date().toISOString();

  if (existingIndex >= 0) {
    const existing = items[existingIndex];
    items[existingIndex] = {
      ...existing,
      meaningInContext: suggestion.meaningInContext,
      sourceSentence: suggestion.sourceSentence,
      state,
      seenCount: existing.seenCount + 1,
      forgottenCount: existing.forgottenCount + (state === "unknown" ? 1 : 0),
      updatedAt: now,
    };
  } else {
    items.unshift({
      id: crypto.randomUUID(),
      learnerId,
      term: suggestion.term,
      meaningInContext: suggestion.meaningInContext,
      sourceSentence: suggestion.sourceSentence,
      state,
      seenCount: 1,
      forgottenCount: state === "unknown" ? 1 : 0,
      updatedAt: now,
    });
  }

  saveVocabulary(learnerId, items);
  return items;
}

export function upsertVocabularyCandidates(
  learnerId: string,
  candidates: VocabularyCandidate[],
): VocabularyItem[] {
  const items = loadVocabulary(learnerId);
  const now = new Date().toISOString();

  candidates.forEach((candidate) => {
    const term = candidate.term.trim();
    if (!term) return;
    const normalizedTerm = term.toLocaleLowerCase();
    const index = items.findIndex((item) => item.term.trim().toLocaleLowerCase() === normalizedTerm);
    if (index >= 0) {
      const current = items[index];
      items[index] = {
        ...current,
        meaningInContext: candidate.meaningInContext || current.meaningInContext,
        sourceSentence: candidate.sourceSentence || current.sourceSentence,
        seenCount: current.seenCount + 1,
        sourceTypes: Array.from(new Set([...(current.sourceTypes ?? []), candidate.sourceType])),
        updatedAt: now,
      };
      return;
    }
    items.unshift({
      id: crypto.randomUUID(),
      learnerId,
      term,
      meaningInContext: candidate.meaningInContext,
      sourceSentence: candidate.sourceSentence,
      state: "fuzzy",
      seenCount: 1,
      forgottenCount: 0,
      nextReviewAt: now,
      kind: candidate.kind ?? (term.includes(" ") ? "phrase" : "word"),
      sourceTypes: [candidate.sourceType],
      firstSeenAt: now,
      updatedAt: now,
    });
  });
  saveVocabulary(learnerId, items);
  return items;
}

export function reviewVocabularyItem(
  learnerId: string,
  itemId: string,
  result: "known" | "fuzzy" | "unknown",
): VocabularyItem[] {
  const now = new Date();
  const items = loadVocabulary(learnerId);
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) return items;
  const current = items[index];
  const nextReviewAt = new Date(now);
  const days = result === "known" ? 7 : result === "fuzzy" ? 2 : 1;
  nextReviewAt.setDate(nextReviewAt.getDate() + days);
  items[index] = {
    ...current,
    state: result,
    forgottenCount: current.forgottenCount + (result === "unknown" ? 1 : 0),
    nextReviewAt: nextReviewAt.toISOString(),
    lastReviewedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  saveVocabulary(learnerId, items);
  return items;
}

export function getReviewVocabulary(learnerId: string, now = new Date()): VocabularyItem[] {
  return loadVocabulary(learnerId).filter((item) => !item.nextReviewAt || new Date(item.nextReviewAt) <= now);
}

function normalizeVocabularyItem(item: VocabularyItem): VocabularyItem {
  return {
    ...item,
    kind: item.kind ?? (item.term.includes(" ") ? "phrase" : "word"),
    sourceTypes: item.sourceTypes ?? ["translation"],
    firstSeenAt: item.firstSeenAt ?? item.updatedAt,
  };
}

function translationKey(learnerId: string): string {
  return `readflow.learner.${learnerId}.translations`;
}

export function loadTranslationRecords(learnerId: string): TranslationRecord[] {
  return readJson<TranslationRecord[]>(translationKey(learnerId), []);
}

export function saveTranslationRecord(record: TranslationRecord): void {
  const records = loadTranslationRecords(record.learnerId);
  writeJson(translationKey(record.learnerId), [record, ...records].slice(0, 100));
}

function readingKey(learnerId: string): string {
  return `readflow.learner.${learnerId}.readings`;
}

export function loadReadingAttempts(learnerId: string): ReadingAttempt[] {
  return readJson<ReadingAttempt[]>(readingKey(learnerId), []);
}

export function saveReadingAttempt(attempt: ReadingAttempt): void {
  const attempts = loadReadingAttempts(attempt.learnerId);
  writeJson(readingKey(attempt.learnerId), [attempt, ...attempts].slice(0, 50));
}

function profileKey(learnerId: string): string {
  return `readflow.learner.${learnerId}.profile`;
}

export function loadLearningProfile(learnerId: string): LearningProfile | null {
  return readJson<LearningProfile | null>(profileKey(learnerId), null);
}

export function saveLearningProfile(profile: LearningProfile): void {
  writeJson(profileKey(profile.learnerId), profile);
}

export function buildLearningSnapshot(learnerId: string): Record<string, unknown> {
  const vocabulary = loadVocabulary(learnerId);
  const readings = loadReadingAttempts(learnerId);
  return {
    vocabulary: {
      total: vocabulary.length,
      unknown: vocabulary.filter((item) => item.state === "unknown").length,
      fuzzy: vocabulary.filter((item) => item.state === "fuzzy").length,
      reviewDue: getReviewVocabulary(learnerId).length,
      frequentTerms: vocabulary.slice(0, 8).map((item) => item.term),
    },
    reading: { attempts: readings.length, latestFeedback: readings[0]?.evaluation?.summary ?? null },
  };
}
