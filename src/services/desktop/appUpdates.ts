import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type AppUpdateStatus =
  | { kind: "checking"; message: string; update: null }
  | { kind: "current"; message: string; update: null }
  | { kind: "available"; message: string; update: Update }
  | { kind: "installing"; message: string; update: Update }
  | { kind: "error"; message: string; update: null };

export async function getAppVersion(): Promise<string> {
  return getVersion();
}

export async function checkForAppUpdate(): Promise<AppUpdateStatus> {
  try {
    const update = await check({ timeout: 15_000 });
    if (!update) {
      return { kind: "current", message: "当前已是最新版本", update: null };
    }

    return {
      kind: "available",
      message: `发现 v${update.version}，可下载并安装`,
      update,
    };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? `检查更新失败：${error.message}` : "检查更新失败，请稍后重试",
      update: null,
    };
  }
}

export async function installAppUpdate(update: Update): Promise<never> {
  await update.downloadAndInstall();
  await relaunch();
  throw new Error("应用重启失败，请手动重新打开 ReadFlow");
}
