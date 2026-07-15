import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import { aiGateway } from "../../services/ai/aiGateway";
import {
  getLatestQuickExplanationPayload,
  hideQuickExplainer,
  listenForQuickExplanation,
  type QuickCapturePayload,
} from "../../services/desktop/quickCapture";
import {
  loadActiveLearnerId,
  loadLearners,
} from "../../services/storage/learnerRepository";
import {
  loadQuickExplanationHistory,
  saveQuickExplanationHistory,
} from "../../services/storage/quickHistoryRepository";
import type {
  QuickExplanationChatMessage,
  QuickExplanationChatResult,
  QuickExplanationHistoryRecord,
  QuickExplanationResult,
} from "../../shared/types";

export function QuickExplainerApp() {
  const [initialState] = useState(() => {
    const learner = getCurrentLearner();
    const history = loadQuickExplanationHistory(learner.id);
    return { learner, history };
  });
  const { learner } = initialState;
  const latestRecord = initialState.history[0];
  const [history, setHistory] = useState(initialState.history);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(latestRecord?.id ?? null);
  const [source, setSource] = useState(latestRecord?.sourceText ?? "");
  const [result, setResult] = useState<QuickExplanationResult | null>(latestRecord?.result ?? null);
  const [message, setMessage] = useState(
    latestRecord ? "已恢复上一次解读" : "在任意应用选中文字并按快捷键，或直接输入内容",
  );
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatMessages, setChatMessages] = useState<QuickExplanationChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState("完成解读后，可以继续追问任何细节");
  const requestSequence = useRef(0);
  const lastPayloadId = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const explainText = useCallback(
    async (input: string) => {
      const text = input.trim();
      if (!text) {
        setMessage("请输入需要理解的中文或英文内容");
        return;
      }

      const requestId = ++requestSequence.current;
      setLoading(true);
      setCopied(false);
      setResult(null);
      setCurrentRecordId(null);
      setChatMessages([]);
      setChatInput("");
      setChatMessage("正在等待初始解读完成");
      setMessage("AI 正在结合上下文解读…");
      try {
        const nextResult = await aiGateway.execute<QuickExplanationResult>({
          task: "quick-explain",
          learnerId: learner.id,
          payload: {
            text,
            learnerContext: {
              name: learner.name,
              goals: learner.goals,
              interests: learner.interests,
            },
          },
        });
        if (requestId !== requestSequence.current) return;

        const record: QuickExplanationHistoryRecord = {
          id: crypto.randomUUID(),
          learnerId: learner.id,
          sourceText: text,
          result: nextResult,
          createdAt: new Date().toISOString(),
        };
        saveQuickExplanationHistory(record);
        setHistory((records) => [record, ...records].slice(0, 100));
        setCurrentRecordId(record.id);
        setResult(nextResult);
        setMessage("解读完成并已保存到历史");
        setChatMessage("可以继续追问这段内容");
      } catch (error) {
        if (requestId !== requestSequence.current) return;
        setMessage(error instanceof Error ? error.message : "划词理解失败");
        setChatMessage("初始解读失败后暂时不能继续追问");
      } finally {
        if (requestId === requestSequence.current) setLoading(false);
      }
    },
    [learner],
  );

  const acceptCapturedPayload = useCallback(
    (payload: QuickCapturePayload) => {
      if (payload.id <= lastPayloadId.current) return;
      lastPayloadId.current = payload.id;

      if (payload.text) {
        setSource(payload.text);
        setMessage(`已通过 ${payload.shortcut} 捕获选中文字`);
        textareaRef.current?.focus();
        void explainText(payload.text);
      } else {
        setMessage(
          source || history.length > 0
            ? "没有捕获到新选区，继续显示上一次内容"
            : payload.error ?? "没有捕获到选中文字",
        );
        textareaRef.current?.focus();
      }
    },
    [explainText, history.length, source],
  );

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForQuickExplanation(acceptCapturedPayload).then((cleanup) => {
      if (disposed) cleanup();
      else {
        unlisten = cleanup;
        void getLatestQuickExplanationPayload().then((payload) => {
          if (!disposed && payload) acceptCapturedPayload(payload);
        });
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [acceptCapturedPayload]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlistenFocus: (() => void) | undefined;

    const syncLatestPayload = () => {
      void getLatestQuickExplanationPayload().then((payload) => {
        if (!disposed && payload) acceptCapturedPayload(payload);
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") syncLatestPayload();
    };

    window.addEventListener("focus", syncLatestPayload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) syncLatestPayload();
      })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlistenFocus = cleanup;
      });

    return () => {
      disposed = true;
      unlistenFocus?.();
      window.removeEventListener("focus", syncLatestPayload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [acceptCapturedPayload]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") void hideQuickExplainer();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  function selectHistory(record: QuickExplanationHistoryRecord) {
    requestSequence.current += 1;
    setCurrentRecordId(record.id);
    setSource(record.sourceText);
    setResult(record.result);
    setLoading(false);
    setCopied(false);
    setChatMessages([]);
    setChatInput("");
    setMessage(`已打开 ${formatHistoryTime(record.createdAt)} 的解读`);
    setChatMessage("已切换记录，可以围绕这段内容重新开始追问");
  }

  async function copyExplanation() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(formatExplanation(result));
      setCopied(true);
      setMessage("完整解读已复制");
    } catch {
      setMessage("复制失败，请手动选择内容复制");
    }
  }

  async function sendChat() {
    const question = chatInput.trim();
    if (!question || !result || chatLoading) return;

    const userMessage: QuickExplanationChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };
    const previousMessages = chatMessages.slice(-12);
    setChatMessages((messages) => [...messages, userMessage]);
    setChatInput("");
    setChatLoading(true);
    setChatMessage("Pi Agent 正在判断是否需要联网…");
    try {
      const response = await aiGateway.execute<QuickExplanationChatResult>({
        task: "quick-explain-chat",
        learnerId: learner.id,
        payload: {
          sourceText: source,
          explanation: result,
          messages: previousMessages.map(({ role, content }) => ({ role, content })),
          question,
          learnerContext: {
            name: learner.name,
            goals: learner.goals,
            interests: learner.interests,
          },
        },
      });
      setChatMessages((messages) => [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.answer,
          sources: response.sources,
          toolActivities: response.toolActivities,
        },
      ]);
      setChatMessage(
        response.toolActivities.length > 0 ? "Agent 已联网核对，可以继续追问" : "可以继续追问",
      );
    } catch (error) {
      setChatMessage(error instanceof Error ? error.message : "继续追问失败");
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <main className="quick-explainer-shell">
      <header className="quick-translator-header quick-explainer-header">
        <div>
          <span className="quick-logo">R</span>
          <div>
            <strong>ReadFlow 划词理解</strong>
            <small>{learner.name} · 中文解释 · 可继续追问</small>
          </div>
        </div>
        <button aria-label="关闭划词理解" onClick={() => void hideQuickExplainer()}>
          ×
        </button>
      </header>

      <div className="quick-explainer-layout">
        <aside className="quick-history-sidebar">
          <div className="quick-column-heading">
            <strong>解读历史</strong>
            <span>{history.length}</span>
          </div>
          <div className="quick-history-list">
            {history.length === 0 ? (
              <p className="quick-history-empty">完成第一次解读后，历史会显示在这里。</p>
            ) : (
              history.map((record) => (
                <button
                  key={record.id}
                  className={record.id === currentRecordId ? "active" : ""}
                  onClick={() => selectHistory(record)}
                >
                  <strong>{record.result.overview}</strong>
                  <span>{truncateText(record.sourceText, 76)}</span>
                  <small>{formatHistoryTime(record.createdAt)}</small>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="quick-explanation-workspace">
          <section className="quick-source-panel quick-explanation-source">
            <div className="quick-panel-heading">
              <span>选中内容</span>
              <small>{source.length} 字符</small>
            </div>
            <textarea
              ref={textareaRef}
              value={source}
              onChange={(event) => {
                requestSequence.current += 1;
                setSource(event.target.value);
                setResult(null);
                setCurrentRecordId(null);
                setChatMessages([]);
                setLoading(false);
                setMessage("按 ⌘↵ 开始解读");
                setChatMessage("完成解读后，可以继续追问");
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void explainText(source);
                }
              }}
              placeholder="输入中文、英文或中英混合内容…"
            />
          </section>

          <section className="quick-result-panel quick-explanation-result">
            <div className="quick-panel-heading">
              <span>中文解读</span>
              {result && (
                <button onClick={() => void copyExplanation()}>
                  {copied ? "已复制" : "复制全部"}
                </button>
              )}
            </div>
            <div className="quick-explanation-scroll">
              {!result ? (
                <div className="quick-explanation-empty">{message}</div>
              ) : (
                <ExplanationContent result={result} />
              )}
            </div>
          </section>

          <footer className="quick-translator-footer quick-explainer-footer">
            <small>{result ? `${languageLabel(result.sourceLanguage)} · ${message}` : message}</small>
            <button
              className="primary-button"
              disabled={loading || !source.trim()}
              onClick={() => void explainText(source)}
            >
              {loading ? "解读中…" : result ? "重新解读" : "开始解读"}
            </button>
          </footer>
        </section>

        <aside className="quick-chat-panel">
          <div className="quick-column-heading">
            <div>
              <strong>继续聊聊</strong>
              <small>Pi Agent · 可自主联网</small>
            </div>
          </div>
          <div className="quick-chat-messages">
            {chatMessages.length === 0 && (
              <div className="quick-chat-empty">
                <span>AI</span>
                <p>{chatMessage}</p>
                <small>例如：这里为什么用这个词？作者真正想表达什么？</small>
              </div>
            )}
            {chatMessages.map((item) => (
              <article key={item.id} className={`quick-chat-message ${item.role}`}>
                <span>{item.role === "user" ? "我" : "AI"}</span>
                <div className="quick-chat-bubble">
                  <p>{item.content}</p>
                  {!!item.toolActivities?.length && (
                    <div className="quick-chat-tools">
                      {item.toolActivities.map((activity, index) => (
                        <span
                          key={`${activity.kind}-${index}-${activity.query ?? activity.url ?? "tool"}`}
                          className={activity.status === "failed" ? "failed" : undefined}
                          title={activity.query ?? activity.url}
                        >
                          {activity.label}
                          {activity.query ? `：${activity.query}` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  {!!item.sources?.length && (
                    <div className="quick-chat-sources">
                      <strong>参考来源</strong>
                      {item.sources.map((source, index) => (
                        <button
                          key={`${source.url}-${index}`}
                          type="button"
                          title={source.url}
                          onClick={() => {
                            void openExternal(source.url).catch(() => {
                              setChatMessage("无法打开来源链接");
                            });
                          }}
                        >
                          <span>{index + 1}</span>
                          {source.title || new URL(source.url).hostname}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
            {chatLoading && (
              <div className="quick-chat-typing">
                <span />
                Pi Agent 正在分析，必要时会联网搜索并读取网页…
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="quick-chat-composer">
            <textarea
              value={chatInput}
              disabled={!result || chatLoading}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendChat();
                }
              }}
              placeholder={result ? "继续追问，Enter 发送…" : "请先完成一次解读"}
            />
            <div>
              <small>{chatMessage}</small>
              <button
                className="primary-button"
                disabled={!result || !chatInput.trim() || chatLoading}
                onClick={() => void sendChat()}
              >
                发送
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function ExplanationContent({ result }: { result: QuickExplanationResult }) {
  return (
    <>
      <section className="quick-explanation-overview">
        <span>主要内容</span>
        <strong>{result.overview}</strong>
      </section>
      <ExplanationSection title="怎么理解">
        <p>{result.explanation}</p>
      </ExplanationSection>
      {result.keyPoints.length > 0 && (
        <ExplanationSection title="关键信息">
          <ul>
            {result.keyPoints.map((point, index) => (
              <li key={`${index}-${point}`}>{point}</li>
            ))}
          </ul>
        </ExplanationSection>
      )}
      {result.terms.length > 0 && (
        <ExplanationSection title="关键表达">
          <dl className="quick-explanation-terms">
            {result.terms.map((item, index) => (
              <div key={`${index}-${item.term}`}>
                <dt>{item.term}</dt>
                <dd>{item.meaning}</dd>
              </div>
            ))}
          </dl>
        </ExplanationSection>
      )}
      <ExplanationSection title="语气与意图">
        <p>{result.toneAndIntent}</p>
      </ExplanationSection>
      {result.translation && (
        <ExplanationSection title="参考译文">
          <p>{result.translation}</p>
        </ExplanationSection>
      )}
    </>
  );
}

function ExplanationSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="quick-explanation-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function getCurrentLearner() {
  const learners = loadLearners();
  const activeLearnerId = loadActiveLearnerId();
  return learners.find((learner) => learner.id === activeLearnerId) ?? learners[0];
}

function languageLabel(language: QuickExplanationResult["sourceLanguage"]): string {
  if (language === "zh") return "中文";
  if (language === "en") return "English";
  return "中英混合";
}

function formatHistoryTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function truncateText(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length)}…` : normalized;
}

function formatExplanation(result: QuickExplanationResult): string {
  const sections = [
    `主要内容\n${result.overview}`,
    `怎么理解\n${result.explanation}`,
    result.keyPoints.length > 0 ? `关键信息\n${result.keyPoints.map((item) => `- ${item}`).join("\n")}` : "",
    result.terms.length > 0
      ? `关键表达\n${result.terms.map((item) => `${item.term}：${item.meaning}`).join("\n")}`
      : "",
    `语气与意图\n${result.toneAndIntent}`,
    result.translation ? `参考译文\n${result.translation}` : "",
  ];
  return sections.filter(Boolean).join("\n\n");
}
