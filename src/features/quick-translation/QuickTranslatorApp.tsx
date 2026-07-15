import { useCallback, useEffect, useRef, useState } from "react";
import { aiGateway } from "../../services/ai/aiGateway";
import {
  hideQuickTranslator,
  listenForQuickCapture,
  openTranslationWorkbench,
} from "../../services/desktop/quickCapture";
import {
  loadActiveLearnerId,
  loadLearners,
} from "../../services/storage/learnerRepository";
import type { QuickTranslationResult } from "../../shared/types";

export function QuickTranslatorApp() {
  const [source, setSource] = useState("");
  const [result, setResult] = useState<QuickTranslationResult | null>(null);
  const [message, setMessage] = useState("在任意应用选中文字并按快捷键，或直接输入内容");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const requestSequence = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const translateText = useCallback(async (input: string) => {
    const text = input.trim();
    if (!text) {
      setMessage("请输入中文或英文");
      return;
    }

    const requestId = ++requestSequence.current;
    const learner = getCurrentLearner();
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
      setResult(nextResult);
      setMessage("翻译完成");
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setMessage(error instanceof Error ? error.message : "快速翻译失败");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForQuickCapture((payload) => {
      if (payload.text) {
        setSource(payload.text);
        setMessage(`已通过 ${payload.shortcut} 捕获选中文字`);
        textareaRef.current?.focus();
        void translateText(payload.text);
      } else {
        requestSequence.current += 1;
        setSource("");
        setResult(null);
        setLoading(false);
        setMessage(payload.error ?? "没有捕获到选中文字");
        textareaRef.current?.focus();
      }
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [translateText]);

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

  return (
    <main className="quick-translator-shell">
      <header className="quick-translator-header">
        <div>
          <span className="quick-logo">R</span>
          <div>
            <strong>ReadFlow 快速翻译</strong>
            <small>自动识别中文或英文</small>
          </div>
        </div>
        <button aria-label="关闭快速翻译" onClick={() => void hideQuickTranslator()}>
          ×
        </button>
      </header>

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
