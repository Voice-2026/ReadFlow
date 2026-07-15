import type {
  Learner,
  TranslationRecord,
  VocabularyItem,
  VocabularyState,
  VocabularySuggestion,
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

export function createLearner(name: string): Learner {
  const trimmedName = name.trim();
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: trimmedName,
    avatar: trimmedName.slice(0, 1) || "学",
    goals: [],
    interests: [],
    createdAt: now,
    updatedAt: now,
  };
}

function vocabularyKey(learnerId: string): string {
  return `readflow.learner.${learnerId}.vocabulary`;
}

export function loadVocabulary(learnerId: string): VocabularyItem[] {
  return readJson<VocabularyItem[]>(vocabularyKey(learnerId), []);
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
