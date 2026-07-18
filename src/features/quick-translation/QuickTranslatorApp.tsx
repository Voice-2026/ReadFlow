import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { aiGateway } from "../../services/ai/aiGateway";
import {
  getLatestQuickTranslationPayload,
  hideQuickTranslator,
  listenForQuickCapture,
  openTranslationWorkbench,
  type QuickCapturePayload,
} from "../../services/desktop/quickCapture";
import {
  loadActiveLearnerId,
  loadLearners,
} from "../../services/storage/learnerRepository";
import {
  loadQuickTranslationHistory,
  saveQuickTranslationHistory,
} from "../../services/storage/quickHistoryRepository";
import type {
  QuickTranslationHistoryRecord,
  QuickTranslationResult,
} from "../../shared/types";
import { AccessibilityPermissionHelp } from "../../shared/AccessibilityPermissionHelp";
import { WindowPinButton } from "../../shared/WindowPinButton";

export function QuickTranslatorApp() {
  const [initialState] = useState(() => {
    const learner = getCurrentLearner();
    const history = loadQuickTranslationHistory(learner.id);
    return { learner, history };
  });
  const { learner } = initialState;
  const latestRecord = initialState.history[0];
  const [history, setHistory] = useState(initialState.history);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(latestRecord?.id ?? null);
  const [source, setSource] = useState(latestRecord?.sourceText ?? "");
  const [result, setResult] = useState<QuickTranslationResult | null>(latestRecord?.result ?? null);
  const [message, setMessage] = useState(
    latestRecord ? "已恢复上一次翻译" : "在任意应用选中文字并按快捷键，或直接输入内容",
  );
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const requestSequence = useRef(0);
  const lastPayloadId = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const translateText = useCallback(async (input: string) => {
    const text = input.trim();
    if (!text) {
      setMessage("请输入中文或英文");
      return;
    }

    const requestId = ++requestSequence.current;
    setLoading(true);
    setCopied(false);
    setResult(null);
    setMessage("AI 正在识别语言并翻译…");
    try {
      const nextResult = await aiGateway.execute<QuickTranslationResult>({
        task: "quick-translate",
        learnerId: learner.id,
        payload: { text },
      });
      if (requestId !== requestSequence.current) return;
      const record: QuickTranslationHistoryRecord = {
        id: crypto.randomUUID(),
        learnerId: learner.id,
        sourceText: text,
        result: nextResult,
        createdAt: new Date().toISOString(),
      };
      saveQuickTranslationHistory(record);
      setHistory((records) => [record, ...records].slice(0, 100));
      setCurrentRecordId(record.id);
      setResult(nextResult);
      setMessage("翻译完成并已保存到历史");
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setMessage(error instanceof Error ? error.message : "快速翻译失败");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [learner.id]);

  const acceptCapturedPayload = useCallback(
    (payload: QuickCapturePayload) => {
      if (payload.id <= lastPayloadId.current) return;
      lastPayloadId.current = payload.id;

      if (payload.text) {
        setSource(payload.text);
        setMessage(`已通过 ${payload.shortcut} 捕获选中文字`);
        textareaRef.current?.focus();
        void translateText(payload.text);
      } else {
        setMessage(
          source || history.length > 0
            ? "没有捕获到新选区，继续显示上一次内容"
            : payload.error ?? "没有捕获到选中文字",
        );
        textareaRef.current?.focus();
      }
    },
    [history.length, source, translateText],
  );

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForQuickCapture(acceptCapturedPayload).then((cleanup) => {
      if (disposed) cleanup();
      else {
        unlisten = cleanup;
        void getLatestQuickTranslationPayload().then((payload) => {
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
      void getLatestQuickTranslationPayload().then((payload) => {
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
      if (event.key === "Escape") void hideQuickTranslator();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function copyTranslation() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.translation);
      setCopied(true);
      setMessage("译文已复制");
    } catch {
      setMessage("复制失败，请手动选择译文复制");
    }
  }

  function swapAndTranslate() {
    if (!result) return;
    const nextSource = result.translation;
    setSource(nextSource);
    void translateText(nextSource);
  }

  function selectHistory(record: QuickTranslationHistoryRecord) {
    requestSequence.current += 1;
    setCurrentRecordId(record.id);
    setSource(record.sourceText);
    setResult(record.result);
    setLoading(false);
    setCopied(false);
    setMessage(`已打开 ${formatHistoryTime(record.createdAt)} 的翻译`);
  }

  return (
    <main className="quick-translator-shell">
      <header className="quick-translator-header">
        <div className="quick-window-title">
          <span className="quick-logo">R</span>
          <div>
            <strong>ReadFlow 快速翻译</strong>
            <small>自动识别中文或英文</small>
          </div>
        </div>
        <div className="quick-window-actions">
          <WindowPinButton onStatusChange={setMessage} />
          <button
            type="button"
            className="quick-window-action quick-window-close"
            aria-label="关闭快速翻译"
            title="关闭"
            onClick={() => void hideQuickTranslator()}
          >
            ×
          </button>
        </div>
      </header>

      <section className="quick-translation-history">
        <div>
          <strong>最近翻译</strong>
          <span>{history.length}</span>
        </div>
        <div className="quick-translation-history-list">
          {history.length === 0 ? (
            <small>完成第一次翻译后，历史会显示在这里。</small>
          ) : (
            history.slice(0, 8).map((record) => (
              <button
                key={record.id}
                className={record.id === currentRecordId ? "active" : ""}
                onClick={() => selectHistory(record)}
              >
                <strong>{truncateText(record.sourceText, 28)}</strong>
                <span>{formatHistoryTime(record.createdAt)}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="quick-source-panel">
        <div className="quick-panel-heading">
          <span>原文</span>
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
            setLoading(false);
            setMessage("按 ⌘↵ 开始翻译");
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void translateText(source);
            }
          }}
          placeholder="输入中文或英文…"
        />
      </section>

      <div className="quick-direction-row">
        <span>
          {result
            ? `${languageLabel(result.sourceLanguage)} → ${languageLabel(result.targetLanguage)}`
            : "中文 ⇄ English"}
        </span>
        <button disabled={!result || loading} onClick={swapAndTranslate}>
          互换
        </button>
      </div>

      <section className="quick-result-panel">
        <div className="quick-panel-heading">
          <span>译文</span>
          {result && (
            <button onClick={() => void copyTranslation()}>{copied ? "已复制" : "复制"}</button>
          )}
        </div>
        <div className={`quick-result-content ${result ? "has-result" : ""}`}>
          {result?.translation ?? message}
          <AccessibilityPermissionHelp message={message} />
        </div>
      </section>

      <footer className="quick-translator-footer">
        <button
          className="quick-workbench-button"
          disabled={!source.trim()}
          onClick={() => void openTranslationWorkbench(source)}
        >
          在工作台深入学习
        </button>
        <button
          className="primary-button"
          disabled={loading || !source.trim()}
          onClick={() => void translateText(source)}
        >
          {loading ? "翻译中…" : "立即翻译"}
        </button>
      </footer>
    </main>
  );
}

function getCurrentLearner() {
  const learners = loadLearners();
  const activeLearnerId = loadActiveLearnerId();
  return learners.find((learner) => learner.id === activeLearnerId) ?? learners[0];
}

function languageLabel(language: "zh" | "en"): string {
  return language === "zh" ? "中文" : "English";
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
