import { useEffect, useRef, useState } from "react";
import {
  clearAiApiKey,
  getAiConfigurationStatus,
  saveAiConfiguration,
  testAiConfiguration,
  type AiProvider,
  type AiConfigurationStatus,
} from "../../services/ai/aiGateway";
import {
  setQuickCaptureRecording,
  updateQuickCaptureShortcut,
  updateQuickExplanationShortcut,
  type QuickCaptureStatus,
} from "../../services/desktop/quickCapture";
import {
  checkForAppUpdate,
  getAppVersion,
  installAppUpdate,
  type AppUpdateStatus,
} from "../../services/desktop/appUpdates";

type SettingsWorkspaceProps = {
  aiStatus: AiConfigurationStatus;
  onAiStatusChange: (status: AiConfigurationStatus) => void;
  quickCaptureStatus: QuickCaptureStatus;
  onQuickCaptureStatusChange: (status: QuickCaptureStatus) => void;
  quickExplanationStatus: QuickCaptureStatus;
  onQuickExplanationStatusChange: (status: QuickCaptureStatus) => void;
};

const modifierCodes = new Set([
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
]);

const aiProviders: Array<{
  id: AiProvider;
  label: string;
  baseUrl: string;
  model: string;
}> = [
  {
    id: "openai-compatible",
    label: "OpenAI Compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
  },
  {
    id: "google",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.5-flash",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1-mini",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
  },
];

export function SettingsWorkspace({
  aiStatus,
  onAiStatusChange,
  quickCaptureStatus,
  onQuickCaptureStatusChange,
  quickExplanationStatus,
  onQuickExplanationStatusChange,
}: SettingsWorkspaceProps) {
  const [recording, setRecording] = useState(false);
  const [pendingShortcut, setPendingShortcut] = useState(quickCaptureStatus.shortcutValue);
  const [message, setMessage] = useState(quickCaptureStatus.message);
  const [saving, setSaving] = useState(false);
  const recorderRef = useRef<HTMLButtonElement>(null);
  const resumeShortcutTimerRef = useRef<number | null>(null);
  const [recordingExplanation, setRecordingExplanation] = useState(false);
  const [pendingExplanationShortcut, setPendingExplanationShortcut] = useState(
    quickExplanationStatus.shortcutValue,
  );
  const [explanationMessage, setExplanationMessage] = useState(quickExplanationStatus.message);
  const [savingExplanation, setSavingExplanation] = useState(false);
  const explanationRecorderRef = useRef<HTMLButtonElement>(null);
  const [provider, setProvider] = useState<AiProvider>(aiStatus.provider);
  const [baseUrl, setBaseUrl] = useState(aiStatus.baseUrl);
  const [model, setModel] = useState(aiStatus.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(aiStatus.hasApiKey);
  const [aiMessage, setAiMessage] = useState(aiStatus.message);
  const [savingAi, setSavingAi] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState(false);
  const [clearingApiKey, setClearingApiKey] = useState(false);
  const [appVersion, setAppVersion] = useState("读取中…");
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>({
    kind: "checking",
    message: "正在检查更新",
    update: null,
  });

  useEffect(() => {
    setPendingShortcut(quickCaptureStatus.shortcutValue);
    setMessage(quickCaptureStatus.message);
  }, [quickCaptureStatus]);

  useEffect(() => {
    setPendingExplanationShortcut(quickExplanationStatus.shortcutValue);
    setExplanationMessage(quickExplanationStatus.message);
  }, [quickExplanationStatus]);

  useEffect(() => {
    setProvider(aiStatus.provider);
    setBaseUrl(aiStatus.baseUrl);
    setModel(aiStatus.model ?? "");
    setHasApiKey(aiStatus.hasApiKey);
    setAiMessage(aiStatus.message);
  }, [aiStatus]);

  useEffect(() => {
    void getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("未知"));
    void refreshAppUpdate();
  }, []);

  useEffect(() => {
    const isRecording = recording || recordingExplanation;
    if (!isRecording) return;

    function captureShortcutFromWindow(event: KeyboardEvent) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const setCurrentRecording = recording ? setRecording : setRecordingExplanation;
      const setCurrentMessage = recording ? setMessage : setExplanationMessage;
      const setCurrentShortcut = recording
        ? setPendingShortcut
        : setPendingExplanationShortcut;

      if (event.code === "Escape") {
        setCurrentRecording(false);
        setCurrentMessage("已取消录制");
        void setQuickCaptureRecording(false);
        return;
      }
      if (modifierCodes.has(event.code)) {
        setCurrentMessage("继续按下一个字母、数字或功能键");
        return;
      }

      try {
        setCurrentShortcut(shortcutFromEvent(event));
        setCurrentRecording(false);
        setCurrentMessage("新组合已录制，保存后立即生效");
        resumeQuickCaptureAfterKeyRelease();
      } catch (error) {
        setCurrentMessage(error instanceof Error ? error.message : "无法识别这个快捷键");
      }
    }

    window.addEventListener("keydown", captureShortcutFromWindow, true);
    return () => window.removeEventListener("keydown", captureShortcutFromWindow, true);
  }, [recording, recordingExplanation]);

  useEffect(
    () => () => {
      if (resumeShortcutTimerRef.current !== null) {
        window.clearTimeout(resumeShortcutTimerRef.current);
      }
      void setQuickCaptureRecording(false);
    },
    [],
  );

  async function refreshAppUpdate() {
    setUpdateStatus({ kind: "checking", message: "正在检查更新", update: null });
    setUpdateStatus(await checkForAppUpdate());
  }

  async function installAvailableUpdate() {
    if (!updateStatus.update) return;
    setUpdateStatus({
      kind: "installing",
      message: `正在下载并安装 v${updateStatus.update.version}…`,
      update: updateStatus.update,
    });
    try {
      await installAppUpdate(updateStatus.update);
    } catch (error) {
      setUpdateStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "安装更新失败，请稍后重试",
        update: null,
      });
    }
  }

  function beginRecording() {
    setRecordingExplanation(false);
    void setQuickCaptureRecording(true)
      .then(() => {
        setRecording(true);
        setMessage("请按下新的快捷键组合，Esc 取消");
        requestAnimationFrame(() => recorderRef.current?.focus());
      })
      .catch((error) => {
        setRecording(false);
        setMessage(error instanceof Error ? error.message : "无法暂停当前快捷键");
      });
  }

  async function saveShortcut() {
    setSaving(true);
    try {
      const status = await updateQuickCaptureShortcut(pendingShortcut);
      onQuickCaptureStatusChange(status);
      setMessage("快捷键已保存并立即生效");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存快捷键失败");
    } finally {
      setSaving(false);
    }
  }

  function beginExplanationRecording() {
    setRecording(false);
    void setQuickCaptureRecording(true)
      .then(() => {
        setRecordingExplanation(true);
        setExplanationMessage("请按下新的快捷键组合，Esc 取消");
        requestAnimationFrame(() => explanationRecorderRef.current?.focus());
      })
      .catch((error) => {
        setRecordingExplanation(false);
        setExplanationMessage(error instanceof Error ? error.message : "无法暂停当前快捷键");
      });
  }

  function resumeQuickCaptureAfterKeyRelease() {
    let resumed = false;
    const resume = () => {
      if (resumed) return;
      resumed = true;
      window.removeEventListener("keyup", resume, true);
      if (resumeShortcutTimerRef.current !== null) {
        window.clearTimeout(resumeShortcutTimerRef.current);
        resumeShortcutTimerRef.current = null;
      }
      void setQuickCaptureRecording(false);
    };

    window.addEventListener("keyup", resume, { capture: true, once: true });
    resumeShortcutTimerRef.current = window.setTimeout(resume, 1500);
  }

  async function saveExplanationShortcut() {
    setSavingExplanation(true);
    try {
      const status = await updateQuickExplanationShortcut(pendingExplanationShortcut);
      onQuickExplanationStatusChange(status);
      setExplanationMessage("快捷键已保存并立即生效");
    } catch (error) {
      setExplanationMessage(error instanceof Error ? error.message : "保存快捷键失败");
    } finally {
      setSavingExplanation(false);
    }
  }

  async function saveAi() {
    setSavingAi(true);
    try {
      const status = await saveAiConfiguration({ provider, baseUrl, model, apiKey });
      onAiStatusChange(status);
      setHasApiKey(status.hasApiKey);
      setApiKey("");
      setAiMessage(
        apiKey.trim()
          ? "配置已保存，新的 API Key 已写入 macOS 钥匙串"
          : "Provider、Base URL 和模型配置已保存",
      );
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "保存 AI 配置失败");
    } finally {
      setSavingAi(false);
    }
  }

  async function testAi() {
    setTestingAi(true);
    try {
      setAiMessage(await testAiConfiguration(provider));
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "AI 连接测试失败");
    } finally {
      setTestingAi(false);
    }
  }

  async function changeProvider(nextProvider: AiProvider) {
    const fallback = aiProviders.find((item) => item.id === nextProvider);
    if (!fallback) return;

    setProvider(nextProvider);
    setApiKey("");
    setLoadingProvider(true);
    try {
      const status = await getAiConfigurationStatus(nextProvider);
      setBaseUrl(status.baseUrl);
      setModel(status.model ?? fallback.model);
      setHasApiKey(status.hasApiKey);
      setAiMessage(status.message);
    } catch (error) {
      setBaseUrl(fallback.baseUrl);
      setModel(fallback.model);
      setHasApiKey(false);
      setAiMessage(error instanceof Error ? error.message : "读取 Provider 配置失败");
    } finally {
      setLoadingProvider(false);
    }
  }

  async function clearSavedApiKey() {
    if (!window.confirm(`确认清除 ${providerLabel(provider)} 的 API Key？`)) return;
    setClearingApiKey(true);
    try {
      const status = await clearAiApiKey(provider);
      setHasApiKey(status.hasApiKey);
      setApiKey("");
      setAiMessage("API Key 已从 macOS 钥匙串清除");
      if (aiStatus.provider === provider) onAiStatusChange(status);
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "清除 API Key 失败");
    } finally {
      setClearingApiKey(false);
    }
  }

  return (
    <section className="workspace settings-workspace">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Device Settings</span>
          <h1>设置</h1>
          <p>这些设置只保存在本机，对所有学习者共用。</p>
        </div>
      </header>

      <article className="settings-card">
        <div>
          <span className="settings-label">快速翻译快捷键</span>
          <h2>在其他应用中唤起中英互译小窗口</h2>
          <p>至少包含 Command、Control 或 Option 中的一项，避免普通按键影响日常输入。</p>
        </div>

        <div className="shortcut-configurator">
          <div className="shortcut-current">
            <span>当前组合</span>
            <kbd>{formatShortcutValue(pendingShortcut)}</kbd>
          </div>
          <button
            ref={recorderRef}
            type="button"
            className={`shortcut-recorder ${recording ? "recording" : ""}`}
            onClick={beginRecording}
          >
            {recording ? "正在录制，请按组合键…" : "录制新快捷键"}
          </button>
          <button
            className="primary-button"
            disabled={saving || pendingShortcut === quickCaptureStatus.shortcutValue}
            onClick={() => void saveShortcut()}
          >
            {saving ? "正在保存…" : "保存并启用"}
          </button>
        </div>

        <div className={`settings-message ${quickCaptureStatus.registered ? "ready" : "error"}`}>
          {message}
        </div>
      </article>

      <article className="settings-card shortcut-settings-card">
        <div>
          <span className="settings-label">划词理解快捷键</span>
          <h2>选中文或英文，快速获得中文解读</h2>
          <p>AI 会说明主旨、重点、关键表达和语气意图；英文内容会按需附上参考译文。</p>
        </div>

        <div className="shortcut-configurator">
          <div className="shortcut-current">
            <span>当前组合</span>
            <kbd>{formatShortcutValue(pendingExplanationShortcut)}</kbd>
          </div>
          <button
            ref={explanationRecorderRef}
            type="button"
            className={`shortcut-recorder ${recordingExplanation ? "recording" : ""}`}
            onClick={beginExplanationRecording}
          >
            {recordingExplanation ? "正在录制，请按组合键…" : "录制新快捷键"}
          </button>
          <button
            className="primary-button"
            disabled={
              savingExplanation ||
              pendingExplanationShortcut === quickExplanationStatus.shortcutValue
            }
            onClick={() => void saveExplanationShortcut()}
          >
            {savingExplanation ? "正在保存…" : "保存并启用"}
          </button>
        </div>

        <div
          className={`settings-message ${quickExplanationStatus.registered ? "ready" : "error"}`}
        >
          {explanationMessage}
        </div>
      </article>

      <article className="settings-card ai-settings-card">
        <div>
          <span className="settings-label">Pi AI Runtime</span>
          <h2>统一配置多个模型服务</h2>
          <p>Base URL 和模型名称保存在本机配置文件；API Key 只保存在 macOS 钥匙串。</p>
        </div>

        <div className="ai-settings-form">
          <label>
            Provider
            <select
              value={provider}
              disabled={loadingProvider}
              onChange={(event) => void changeProvider(event.target.value as AiProvider)}
            >
              {aiProviders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Base URL
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <label>
            模型名称
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="输入 Provider 支持的模型 ID"
            />
          </label>
          <label>
            API Key
            <div className="ai-key-control">
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={hasApiKey ? "••••••••••••（已保存）" : "输入 API Key"}
                autoComplete="off"
              />
              {hasApiKey && (
                <button
                  type="button"
                  className="ai-key-clear"
                  disabled={clearingApiKey}
                  onClick={() => void clearSavedApiKey()}
                >
                  {clearingApiKey ? "清除中" : "清除"}
                </button>
              )}
            </div>
            <small>
              {hasApiKey ? "输入新 Key 并保存即可替换，原 Key 不会回显" : "密钥将保存到系统钥匙串"}
            </small>
          </label>
        </div>

        <div className="ai-settings-actions">
          <span className={`settings-message ${hasApiKey ? "ready" : "error"}`}>
            {aiMessage}
          </span>
          <button
            className="secondary-button"
            disabled={testingAi || !hasApiKey || loadingProvider}
            onClick={() => void testAi()}
          >
            {testingAi ? "测试中…" : "测试连接"}
          </button>
          <button className="primary-button" disabled={savingAi} onClick={() => void saveAi()}>
            {savingAi ? "保存中…" : "保存 AI 配置"}
          </button>
        </div>
      </article>

      <article className="settings-card update-settings-card">
        <div>
          <span className="settings-label">About & Updates</span>
          <h2>版本与更新</h2>
          <p>
            当前版本 <strong>v{appVersion}</strong>。ReadFlow 会在打开设置时检查新版本；发现更新后，由你确认下载安装并自动重启。
          </p>
        </div>

        <div className="update-settings-actions">
          <span
            className={`settings-message ${
              updateStatus.kind === "error" ? "error" : updateStatus.kind === "available" ? "update-ready" : ""
            }`}
          >
            {updateStatus.message}
          </span>
          <button
            className="secondary-button"
            disabled={updateStatus.kind === "checking" || updateStatus.kind === "installing"}
            onClick={() => void refreshAppUpdate()}
          >
            {updateStatus.kind === "checking" ? "检查中…" : "检查更新"}
          </button>
          {updateStatus.kind === "available" && (
            <button className="primary-button" onClick={() => void installAvailableUpdate()}>
              下载并安装 v{updateStatus.update.version}
            </button>
          )}
          {updateStatus.kind === "installing" && (
            <button className="primary-button" disabled>
              正在安装…
            </button>
          )}
        </div>
        {updateStatus.kind === "available" && updateStatus.update.body && (
          <p className="update-notes">更新说明：{updateStatus.update.body}</p>
        )}
      </article>
    </section>
  );
}

function shortcutFromEvent(event: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "code">): string {
  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push("Command");
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");

  if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    throw new Error("请至少按住 Command、Control 或 Option 中的一项");
  }

  const code = normalizeKeyCode(event.code);
  return [...modifiers, code].join("+");
}

function providerLabel(provider: AiProvider): string {
  return aiProviders.find((item) => item.id === provider)?.label ?? provider;
}

function normalizeKeyCode(code: string): string {
  if (code.startsWith("Key") || code.startsWith("Digit") || code.startsWith("F")) {
    return code;
  }

  const supported = new Set([
    "Space",
    "Enter",
    "Tab",
    "Backquote",
    "Backslash",
    "BracketLeft",
    "BracketRight",
    "Comma",
    "Equal",
    "Minus",
    "Period",
    "Quote",
    "Semicolon",
    "Slash",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
  ]);
  if (!supported.has(code)) {
    throw new Error("暂不支持这个按键，请使用字母、数字、空格或常见符号键");
  }
  return code;
}

function formatShortcutValue(value: string): string {
  return value
    .split("+")
    .map((part) => {
      const normalized = part.toLowerCase();
      if (["command", "cmd", "super", "commandorcontrol"].includes(normalized)) return "⌘";
      if (["control", "ctrl"].includes(normalized)) return "⌃";
      if (["alt", "option"].includes(normalized)) return "⌥";
      if (normalized === "shift") return "⇧";
      return part.replace(/^Key/, "").replace(/^Digit/, "");
    })
    .join("");
}
