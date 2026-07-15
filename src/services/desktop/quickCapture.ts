import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type QuickCaptureStatus = {
  registered: boolean;
  shortcut: string;
  shortcutValue: string;
  message: string;
};

export type QuickCapturePayload = {
  text?: string;
  error?: string;
  shortcut: string;
};

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

export async function updateQuickCaptureShortcut(
  shortcut: string,
): Promise<QuickCaptureStatus> {
  try {
    return await invoke<QuickCaptureStatus>("update_quick_capture_shortcut", { shortcut });
  } catch (error) {
    throw new Error(typeof error === "string" ? error : "保存快捷键失败");
  }
}

export async function openTranslationWorkbench(text: string): Promise<void> {
  await invoke("open_translation_workbench", { text });
}

export async function hideQuickTranslator(): Promise<void> {
  await invoke("hide_quick_translator");
}

export function listenForQuickCapture(
  handler: (payload: QuickCapturePayload) => void,
): Promise<UnlistenFn> {
  return listen<QuickCapturePayload>("quick-translation-captured", (event) => {
    handler(event.payload);
  });
}
