import { useEffect, useState } from "react";
import { aiGateway } from "../../services/ai/aiGateway";
import {
  confirmVocabularySuggestion,
  loadTranslationRecords,
  saveTranslationRecord,
  upsertVocabularyCandidates,
} from "../../services/storage/learnerRepository";
import { refreshLearningProfile } from "../../services/learning/profileUpdater";
import type {
  Learner,
  TranslationResult,
  VocabularyState,
  VocabularySuggestion,
} from "../../shared/types";
import type { QuickCapturePayload } from "../../services/desktop/quickCapture";

type TranslationMode = "natural" | "literal" | "explain";

const vocabularyStateLabels: Record<VocabularyState, string> = {
  known: "认识",
  fuzzy: "模糊",
  unknown: "不认识",
};

type TranslationWorkspaceProps = {
  learner: Learner;
  capturedSelection: (QuickCapturePayload & { id: number }) | null;
  onCaptureConsumed: () => void;
};

export function TranslationWorkspace({
  learner,
  capturedSelection,
  onCaptureConsumed,
}: TranslationWorkspaceProps) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<TranslationMode>("natural");
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState("等待输入内容");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveRecord, setSaveRecord] = useState(true);
  const [confirmedTerms, setConfirmedTerms] = useState<Record<string, VocabularyState>>({});
  const [historyCount, setHistoryCount] = useState(() => loadTranslationRecords(learner.id).length);

  useEffect(() => {
    setText("");
    setFileName(null);
    setResult(null);
    setMessage("等待输入内容");
    setConfirmedTerms({});
    setHistoryCount(loadTranslationRecords(learner.id).length);
  }, [learner.id]);

  useEffect(() => {
    if (!capturedSelection) return;

    setResult(null);
    setFileName(null);
    setConfirmedTerms({});
    if (capturedSelection.text) {
      setText(capturedSelection.text);
      setMessage(`已通过 ${capturedSelection.shortcut} 捕获选中文字，确认后开始翻译`);
    } else {
      setText("");
      setMessage(capturedSelection.error ?? "没有捕获到选中文字");
    }
    onCaptureConsumed();
  }, [capturedSelection, onCaptureConsumed]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "pdf") {
      setMessage("PDF 文本提取将在下一个文件能力里程碑接入。");
      return;
    }
    setText(await file.text());
    setResult(null);
    setMessage(`已读取 ${file.name}，等待 AI 翻译`);
  }

  async function translate() {
    const sourceText = text.trim();
    if (!sourceText) {
      setMessage("请先粘贴文字或选择文件");
      return;
    }

    setLoading(true);
    setResult(null);
    setConfirmedTerms({});
    setMessage("AI 正在分析译文、句子结构和重点词汇……");
    try {
      const nextResult = await aiGateway.execute<TranslationResult>({
        task: "translate",
        learnerId: learner.id,
        payload: {
          text: sourceText,
          mode,
          fileName,
          learnerContext: {
            name: learner.name,
            goals: learner.goals,
            interests: learner.interests,
          },
        },
      });
      setResult(nextResult);
      setMessage("翻译完成");

      upsertVocabularyCandidates(
        learner.id,
        nextResult.vocabulary.map((candidate) => ({ ...candidate, sourceType: "translation" })),
      );
      void refreshLearningProfile(learner).catch(() => undefined);

      if (saveRecord) {
        saveTranslationRecord({
          id: crypto.randomUUID(),
          learnerId: learner.id,
          sourceType: fileName ? "file" : "text",
          sourceText,
          translation: nextResult.translation,
          summary: nextResult.summary,
          mode,
          fileName: fileName ?? undefined,
          createdAt: new Date().toISOString(),
        });
        setHistoryCount((count) => count + 1);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 翻译暂不可用");
    } finally {
      setLoading(false);
    }
  }

  function confirmSuggestion(suggestion: VocabularySuggestion, state: VocabularyState) {
    confirmVocabularySuggestion(learner.id, suggestion, state);
    setConfirmedTerms((current) => ({ ...current, [suggestion.term]: state }));
    void refreshLearningProfile(learner).catch(() => undefined);
  }

  return (
    <section className="workspace translation-workspace">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">AI Translator</span>
          <h1>翻译器</h1>
          <p>
            当前学习者：{learner.name}。已保存 {historyCount} 次翻译，记录只属于这个学习档案。
          </p>
        </div>
        <label className="file-button">
          选择文件
          <input
            type="file"
            accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </label>
      </header>

      <div className="mode-tabs" aria-label="翻译模式">
        {([
          ["natural", "自然翻译"],
          ["literal", "直译"],
          ["explain", "解释表达"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            className={mode === value ? "active" : ""}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="translation-grid">
        <article className="editor-panel">
          <div className="panel-title">
            <span>原文</span>
            <small>{fileName ?? `${text.length} 字符`}</small>
          </div>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setFileName(null);
            }}
            placeholder="粘贴英文，或选择 txt、md 文件……"
          />
        </article>
        <article className="result-panel">
          <div className="panel-title">
            <span>AI 结果</span>
            <small>逐句对照 · 重点词汇 · 逻辑关系</small>
          </div>
          {result ? (
            <div className="translation-result">
              <section className="result-summary">
                <span>自然译文</span>
                <p>{result.translation}</p>
                <strong>主要表达</strong>
                <p>{result.summary}</p>
              </section>

              {result.sentences.length > 0 && (
                <section className="result-section">
                  <h2>逐句理解</h2>
                  {result.sentences.map((sentence, index) => (
                    <article className="sentence-card" key={`${sentence.source}-${index}`}>
                      <strong>{sentence.source}</strong>
                      <p>{sentence.translation}</p>
                      <small>结构：{sentence.structure}</small>
                      <small>逻辑：{sentence.logic}</small>
                    </article>
                  ))}
                </section>
              )}

              {result.expressions.length > 0 && (
                <section className="result-section">
                  <h2>重要表达</h2>
                  <div className="expression-list">
                    {result.expressions.map((item) => (
                      <article key={item.expression}>
                        <strong>{item.expression}</strong>
                        <span>{item.meaning}</span>
                        <small>{item.note}</small>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {result.vocabulary.length > 0 && (
                <section className="result-section vocabulary-suggestions">
                  <h2>候选单词</h2>
                  <p>AI 只负责推荐，由你确认真实掌握状态。</p>
                  {result.vocabulary.map((suggestion) => {
                    const confirmedState = confirmedTerms[suggestion.term];
                    return (
                      <article key={suggestion.term}>
                        <div>
                          <strong>{suggestion.term}</strong>
                          <span>{suggestion.meaningInContext}</span>
                          <small>{suggestion.reason}</small>
                        </div>
                        <div className="vocabulary-actions">
                          {(Object.keys(vocabularyStateLabels) as VocabularyState[]).map((state) => (
                            <button
                              key={state}
                              className={confirmedState === state ? "active" : ""}
                              onClick={() => confirmSuggestion(suggestion, state)}
                            >
                              {vocabularyStateLabels[state]}
                            </button>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </section>
              )}
            </div>
          ) : (
            <div className="empty-result">
              <span>AI</span>
              <p>{message}</p>
            </div>
          )}
        </article>
      </div>

      <div className="action-row">
        <label className="save-toggle">
          <input
            type="checkbox"
            checked={saveRecord}
            onChange={(event) => setSaveRecord(event.target.checked)}
          />{" "}
          保存到当前学习档案
        </label>
        <button className="primary-button" disabled={loading} onClick={() => void translate()}>
          {loading ? "AI 正在翻译…" : "开始 AI 翻译"}
        </button>
      </div>
    </section>
  );
}
