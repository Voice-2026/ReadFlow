import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type QuickCaptureStatus = {
  registered: boolean;
  shortcut: string;
  shortcutValue: string;
  message: string;
};

export type QuickCapturePayload = {
  id: number;
  text?: string;
  error?: string;
  shortcut: string;
};

export async function getLatestQuickTranslationPayload(): Promise<QuickCapturePayload | null> {
  try {
    return await invoke<QuickCapturePayload | null>("get_latest_quick_translation_payload");
  } catch {
    return null;
  }
}

export async function getLatestQuickExplanationPayload(): Promise<QuickCapturePayload | null> {
  try {
    return await invoke<QuickCapturePayload | null>("get_latest_quick_explanation_payload");
  } catch {
    return null;
  }
}

export async function getQuickCaptureStatus(): Promise<QuickCaptureStatus> {
  try {
    return await invoke<QuickCaptureStatus>("get_quick_capture_status");
  } catch {
    return {
      registered: false,
      shortcut: "⌘⇧Space",
      shortcutValue: "CommandOrControl+Shift+Space",
      message: "快捷选区翻译仅在 Tauri 桌面容器中可用",
    };
  }
}

export async function getQuickExplanationStatus(): Promise<QuickCaptureStatus> {
  try {
    return await invoke<QuickCaptureStatus>("get_quick_explanation_status");
  } catch {
    return {
      registered: false,
      shortcut: "⌘⇧E",
      shortcutValue: "CommandOrControl+Shift+KeyE",
      message: "划词理解仅在 Tauri 桌面容器中可用",
    };
  }
}

export async function updateQuickCaptureShortcut(
  shortcut: string,
): Promise<QuickCaptureStatus> {
  try {
    return await invoke<QuickCaptureStatus>("update_quick_capture_shortcut", { shortcut });
  } catch (error) {
    throw new Error(typeof error === "string" ? error : "保存快捷键失败");
  }
}

export async function updateQuickExplanationShortcut(
  shortcut: string,
): Promise<QuickCaptureStatus> {
  try {
    return await invoke<QuickCaptureStatus>("update_quick_explanation_shortcut", { shortcut });
  } catch (error) {
    throw new Error(typeof error === "string" ? error : "保存划词理解快捷键失败");
  }
}

export async function setQuickCaptureRecording(recording: boolean): Promise<void> {
  await invoke("set_quick_capture_recording", { recording });
}

export async function openTranslationWorkbench(text: string): Promise<void> {
  await invoke("open_translation_workbench", { text });
}

export async function hideQuickTranslator(): Promise<void> {
  await invoke("hide_quick_translator");
}

export async function hideQuickExplainer(): Promise<void> {
  await invoke("hide_quick_explainer");
}

export function listenForQuickCapture(
  handler: (payload: QuickCapturePayload) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(() => undefined);
  return listen<QuickCapturePayload>("quick-translation-captured", (event) => {
    handler(event.payload);
  });
}

export function listenForQuickExplanation(
  handler: (payload: QuickCapturePayload) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(() => undefined);
  return listen<QuickCapturePayload>("quick-explanation-captured", (event) => {
    handler(event.payload);
  });
}
