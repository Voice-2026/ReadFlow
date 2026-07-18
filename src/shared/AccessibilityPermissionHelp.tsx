import { invoke, isTauri } from "@tauri-apps/api/core";
import { useState } from "react";

type AccessibilityPermissionHelpProps = {
  message: string;
};

export function AccessibilityPermissionHelp({ message }: AccessibilityPermissionHelpProps) {
  const [opening, setOpening] = useState(false);
  const needsAccessibilityPermission = message.includes("辅助功能权限");

  if (!needsAccessibilityPermission) return null;

  async function openAccessibilitySettings() {
    if (!isTauri() || opening) return;
    setOpening(true);
    try {
      await invoke("open_accessibility_settings");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="quick-accessibility-help" role="alert">
      <strong>辅助功能需要重新授权</strong>
      <p>当前开关可能对应旧版本。请删除旧 ReadFlow 条目，再添加当前的 /Applications/ReadFlow.app。</p>
      <button type="button" onClick={() => void openAccessibilitySettings()} disabled={!isTauri() || opening}>
        {opening ? "正在打开设置…" : "打开辅助功能设置"}
      </button>
    </div>
  );
}
