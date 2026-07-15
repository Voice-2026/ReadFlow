import type {
  QuickExplanationHistoryRecord,
  QuickTranslationHistoryRecord,
} from "../../shared/types";

const HISTORY_LIMIT = 100;

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

function quickTranslationKey(learnerId: string): string {
  return `readflow.learner.${learnerId}.quickTranslations`;
}

function quickExplanationKey(learnerId: string): string {
  return `readflow.learner.${learnerId}.quickExplanations`;
}

export function loadQuickTranslationHistory(
  learnerId: string,
): QuickTranslationHistoryRecord[] {
  return readJson<QuickTranslationHistoryRecord[]>(quickTranslationKey(learnerId), []).filter(
    (record) => record.learnerId === learnerId,
  );
}

export function saveQuickTranslationHistory(record: QuickTranslationHistoryRecord): void {
  const records = loadQuickTranslationHistory(record.learnerId).filter(
    (item) => item.id !== record.id,
  );
  writeJson(
    quickTranslationKey(record.learnerId),
    [record, ...records].slice(0, HISTORY_LIMIT),
  );
}

export function loadQuickExplanationHistory(
  learnerId: string,
): QuickExplanationHistoryRecord[] {
  return readJson<QuickExplanationHistoryRecord[]>(quickExplanationKey(learnerId), []).filter(
    (record) => record.learnerId === learnerId,
  );
}

export function saveQuickExplanationHistory(record: QuickExplanationHistoryRecord): void {
  const records = loadQuickExplanationHistory(record.learnerId).filter(
    (item) => item.id !== record.id,
  );
  writeJson(
    quickExplanationKey(record.learnerId),
    [record, ...records].slice(0, HISTORY_LIMIT),
  );
}
