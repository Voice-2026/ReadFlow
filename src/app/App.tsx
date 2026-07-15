import { useCallback, useEffect, useState } from "react";
import { useLearners } from "./useLearners";
import { HomeWorkspace } from "../features/home/HomeWorkspace";
import { LearnerSwitcher } from "../features/learners/LearnerSwitcher";
import { ProfileWorkspace } from "../features/profile/ProfileWorkspace";
import { ReadingWorkspace } from "../features/reading/ReadingWorkspace";
import { SettingsWorkspace } from "../features/settings/SettingsWorkspace";
import { TranslationWorkspace } from "../features/translation/TranslationWorkspace";
import { VocabularyWorkspace } from "../features/vocabulary/VocabularyWorkspace";
import {
  getAiConfigurationStatus,
  type AiConfigurationStatus,
} from "../services/ai/aiGateway";
import {
  getQuickCaptureStatus,
  getQuickExplanationStatus,
  listenForQuickCapture,
  type QuickCapturePayload,
  type QuickCaptureStatus,
} from "../services/desktop/quickCapture";

type WorkspaceId = "home" | "translation" | "vocabulary" | "reading" | "profile" | "settings";

const navigation: Array<{ id: WorkspaceId; label: string; mark: string }> = [
  { id: "home", label: "今日学习", mark: "今" },
  { id: "translation", label: "翻译器", mark: "译" },
  { id: "vocabulary", label: "单词本", mark: "词" },
  { id: "reading", label: "阅读理解", mark: "读" },
  { id: "profile", label: "AI 英语画像", mark: "像" },
  { id: "settings", label: "设置", mark: "设" },
];

type CapturedSelection = QuickCapturePayload & { id: number };

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceId>("home");
  const [aiStatus, setAiStatus] = useState<AiConfigurationStatus>({
    configured: false,
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    hasApiKey: false,
    message: "正在检查 AI 配置",
  });
  const [quickCaptureStatus, setQuickCaptureStatus] = useState<QuickCaptureStatus>({
    registered: false,
    shortcut: "⌘⇧Space",
    shortcutValue: "CommandOrControl+Shift+Space",
    message: "正在注册全局快捷键",
  });
  const [quickExplanationStatus, setQuickExplanationStatus] = useState<QuickCaptureStatus>({
    registered: false,
    shortcut: "⌘⇧E",
    shortcutValue: "CommandOrControl+Shift+KeyE",
    message: "正在注册划词理解快捷键",
  });
  const [capturedSelection, setCapturedSelection] = useState<CapturedSelection | null>(null);
  const {
    learners,
    activeLearner,
    activeLearnerId,
    switchLearner,
    addLearner,
  } = useLearners();

  useEffect(() => {
    void getAiConfigurationStatus().then(setAiStatus);
    void getQuickCaptureStatus().then(setQuickCaptureStatus);
    void getQuickExplanationStatus().then(setQuickExplanationStatus);
  }, []);

  const consumeCapturedSelection = useCallback(() => {
    setCapturedSelection(null);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForQuickCapture((payload) => {
      setCapturedSelection((current) => ({
        ...payload,
        id: (current?.id ?? 0) + 1,
      }));
      setWorkspace("translation");
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlisten = cleanup;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div>
            <strong>ReadFlow</strong>
            <small>AI 英语工作台</small>
          </div>
        </div>

        <LearnerSwitcher
          learners={learners}
          activeLearnerId={activeLearnerId}
          onSwitch={switchLearner}
          onCreate={addLearner}
        />

        <nav className="main-navigation" aria-label="主导航">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={workspace === item.id ? "active" : ""}
              onClick={() => setWorkspace(item.id)}
            >
              <span>{item.mark}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className={`status-dot ${aiStatus.configured ? "ready" : ""}`} />
          <div>
            <strong>{aiStatus.configured ? "AI 服务已连接" : "AI 服务待配置"}</strong>
            <small>{aiStatus.model ?? aiStatus.message}</small>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {workspace === "home" && (
          <HomeWorkspace learner={activeLearner} onNavigate={setWorkspace} />
        )}
        {workspace === "translation" && (
          <TranslationWorkspace
            learner={activeLearner}
            capturedSelection={capturedSelection}
            onCaptureConsumed={consumeCapturedSelection}
          />
        )}
        {workspace === "vocabulary" && <VocabularyWorkspace learner={activeLearner} />}
        {workspace === "reading" && <ReadingWorkspace learner={activeLearner} />}
        {workspace === "profile" && <ProfileWorkspace learner={activeLearner} />}
        {workspace === "settings" && (
          <SettingsWorkspace
            aiStatus={aiStatus}
            onAiStatusChange={setAiStatus}
            quickCaptureStatus={quickCaptureStatus}
            onQuickCaptureStatusChange={setQuickCaptureStatus}
            quickExplanationStatus={quickExplanationStatus}
            onQuickExplanationStatusChange={setQuickExplanationStatus}
          />
        )}
      </main>
    </div>
  );
}
