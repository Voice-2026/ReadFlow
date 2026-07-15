export type AiTask =
  | "translate"
  | "quick-translate"
  | "quick-explain"
  | "quick-explain-chat"
  | "analyze-vocabulary"
  | "generate-reading"
  | "evaluate-reading"
  | "update-profile";

export type AiTaskRequest = {
  task: AiTask;
  learnerId: string;
  payload: Record<string, unknown>;
};

export interface AiGateway {
  execute<T>(request: AiTaskRequest): Promise<T>;
}

export type AiProvider =
  | "openai-compatible"
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "deepseek";

export type AiConfigurationStatus = {
  configured: boolean;
  provider: AiProvider;
  baseUrl: string;
  model?: string;
  hasApiKey: boolean;
  message: string;
};

function normalizeInvokeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : "AI 调用失败");
}

export const aiGateway: AiGateway = {
  async execute<T>(request: AiTaskRequest): Promise<T> {
    try {
      return await invoke<T>("execute_ai_task", { request });
    } catch (error) {
      throw normalizeInvokeError(error);
    }
  },
};

export async function getAiConfigurationStatus(
  provider?: AiProvider,
): Promise<AiConfigurationStatus> {
  try {
    return await invoke<AiConfigurationStatus>("get_ai_configuration_status", {
      provider: provider ?? null,
    });
  } catch {
    return {
      configured: false,
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      hasApiKey: false,
      message: "请使用 Tauri 桌面容器运行 ReadFlow",
    };
  }
}

export async function clearAiApiKey(provider: AiProvider): Promise<AiConfigurationStatus> {
  try {
    return await invoke<AiConfigurationStatus>("clear_ai_api_key", { provider });
  } catch (error) {
    throw normalizeInvokeError(error);
  }
}

export async function saveAiConfiguration(input: {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
}): Promise<AiConfigurationStatus> {
  try {
    return await invoke<AiConfigurationStatus>("save_ai_configuration", {
      provider: input.provider,
      baseUrl: input.baseUrl,
      model: input.model,
      apiKey: input.apiKey || null,
    });
  } catch (error) {
    throw normalizeInvokeError(error);
  }
}

export async function testAiConfiguration(provider?: AiProvider): Promise<string> {
  try {
    return await invoke<string>("test_ai_configuration", { provider: provider ?? null });
  } catch (error) {
    throw normalizeInvokeError(error);
  }
}
import { invoke } from "@tauri-apps/api/core";
