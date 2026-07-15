export type VocabularyState = "known" | "fuzzy" | "unknown";

export type Learner = {
  id: string;
  name: string;
  avatar: string;
  goals: string[];
  interests: string[];
  createdAt: string;
  updatedAt: string;
};

export type VocabularyItem = {
  id: string;
  learnerId: string;
  term: string;
  meaningInContext: string;
  sourceSentence: string;
  state: VocabularyState;
  seenCount: number;
  forgottenCount: number;
  nextReviewAt?: string;
  updatedAt: string;
};

export type TranslationRecord = {
  id: string;
  learnerId: string;
  sourceType: "selection" | "text" | "file";
  sourceText: string;
  translation: string;
  summary: string;
  mode: "natural" | "literal" | "explain";
  fileName?: string;
  createdAt: string;
};

export type TranslationSentence = {
  source: string;
  translation: string;
  structure: string;
  logic: string;
};

export type TranslationExpression = {
  expression: string;
  meaning: string;
  note: string;
};

export type VocabularySuggestion = {
  term: string;
  meaningInContext: string;
  sourceSentence: string;
  reason: string;
};

export type TranslationResult = {
  translation: string;
  summary: string;
  sentences: TranslationSentence[];
  expressions: TranslationExpression[];
  vocabulary: VocabularySuggestion[];
};

export type QuickTranslationResult = {
  sourceLanguage: "zh" | "en";
  targetLanguage: "zh" | "en";
  translation: string;
};

export type QuickExplanationTerm = {
  term: string;
  meaning: string;
};

export type QuickExplanationResult = {
  sourceLanguage: "zh" | "en" | "mixed";
  overview: string;
  explanation: string;
  keyPoints: string[];
  terms: QuickExplanationTerm[];
  toneAndIntent: string;
  translation?: string | null;
};

export type QuickTranslationHistoryRecord = {
  id: string;
  learnerId: string;
  sourceText: string;
  result: QuickTranslationResult;
  createdAt: string;
};

export type QuickExplanationHistoryRecord = {
  id: string;
  learnerId: string;
  sourceText: string;
  result: QuickExplanationResult;
  createdAt: string;
};

export type QuickExplanationChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: WebSource[];
  toolActivities?: AgentToolActivity[];
};

export type QuickExplanationChatResult = {
  answer: string;
  sources: WebSource[];
  toolActivities: AgentToolActivity[];
};

export type WebSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type AgentToolActivity = {
  kind: "search" | "fetch";
  status: "completed" | "failed";
  label: string;
  query?: string;
  url?: string;
};

export type ReadingAttempt = {
  id: string;
  learnerId: string;
  passage: string;
  translationAnswer: string;
  mainIdeaAnswer: string;
  feedback?: string;
  createdAt: string;
};

export type ProfileDimension = {
  label: string;
  level: string;
  confidence: "待建立" | "低" | "中" | "高";
  evidence: string;
};
