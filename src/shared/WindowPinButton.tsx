import { PushPin } from "@phosphor-icons/react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

type WindowPinButtonProps = {
  onStatusChange?: (message: string) => void;
};

export function WindowPinButton({ onStatusChange }: WindowPinButtonProps) {
  const [isPinned, setIsPinned] = useState(false);
  const [updating, setUpdating] = useState(false);
  const desktopAvailable = isTauri();

  useEffect(() => {
    if (!desktopAvailable) return;
    let disposed = false;

    void getCurrentWindow()
      .isAlwaysOnTop()
      .then((value) => {
        if (!disposed) setIsPinned(value);
      })
      .catch(() => {
        if (!disposed) onStatusChange?.("无法读取窗口置顶状态");
      });

    return () => {
      disposed = true;
    };
  }, [desktopAvailable, onStatusChange]);

  async function togglePin() {
    if (!desktopAvailable || updating) return;
    const nextPinned = !isPinned;
    setUpdating(true);
    try {
      await getCurrentWindow().setAlwaysOnTop(nextPinned);
      setIsPinned(nextPinned);
      onStatusChange?.(nextPinned ? "窗口已置顶" : "已取消窗口置顶");
    } catch {
      onStatusChange?.(nextPinned ? "窗口置顶失败" : "取消窗口置顶失败");
    } finally {
      setUpdating(false);
    }
  }

  const label = isPinned ? "取消置顶" : "置顶窗口";

  return (
    <button
      type="button"
      className={`quick-window-action quick-window-pin ${isPinned ? "active" : ""}`}
      aria-label={label}
      aria-pressed={isPinned}
      title={desktopAvailable ? label : "仅桌面端支持置顶"}
      disabled={!desktopAvailable || updating}
      onClick={() => void togglePin()}
    >
      <PushPin size={17} weight={isPinned ? "fill" : "regular"} />
    </button>
  );
}
