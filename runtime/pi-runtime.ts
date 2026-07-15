import { createInterface } from "node:readline";
import {
  runAgentLoop,
  type AgentEvent,
} from "@earendil-works/pi-agent-core";
import {
  createModels,
  createProvider,
  type Api,
  type Message,
  type Model,
  type ProviderStreams,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import {
  createWebTools,
  deduplicateSources,
  type WebSource,
  type WebToolDetails,
} from "./web-tools.js";

type RuntimeRequest = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  enableWebTools?: boolean;
};

type ToolActivity = {
  kind: "search" | "fetch";
  status: "completed" | "failed";
  label: string;
  query?: string;
  url?: string;
};

type ProviderDefinition = {
  api: Api;
  implementation: ProviderStreams;
};

const providerDefinitions: Record<string, ProviderDefinition> = {
  openai: {
    api: "openai-responses",
    implementation: openAIResponsesApi(),
  },
  anthropic: {
    api: "anthropic-messages",
    implementation: anthropicMessagesApi(),
  },
  google: {
    api: "google-generative-ai",
    implementation: googleGenerativeAIApi(),
  },
  openrouter: {
    api: "openai-completions",
    implementation: openAICompletionsApi(),
  },
  deepseek: {
    api: "openai-completions",
    implementation: openAICompletionsApi(),
  },
  "openai-compatible": {
    api: "openai-completions",
    implementation: openAICompletionsApi(),
  },
};

async function main() {
  const line = await readRequestLine();
  const request = validateRequest(JSON.parse(line) as Partial<RuntimeRequest>);
  const definition = providerDefinitions[request.provider];
  if (!definition) {
    throw new Error(`Pi Runtime 暂不支持 Provider：${request.provider}`);
  }

  const providerId = `readflow-${request.provider}`;
  const model: Model<Api> = {
    id: request.model,
    name: request.model,
    api: definition.api,
    provider: providerId,
    baseUrl: request.baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_000,
    compat:
      definition.api === "openai-completions"
        ? {
            supportsDeveloperRole: false,
            supportsReasoningEffort: false,
          }
        : undefined,
  };

  const models = createModels();
  models.setProvider(
    createProvider({
      id: providerId,
      name: `ReadFlow ${request.provider}`,
      baseUrl: request.baseUrl,
      auth: {
        apiKey: {
          name: "ReadFlow API Key",
          resolve: async () => undefined,
        },
      },
      models: [model],
      api: definition.implementation,
    }),
  );

  if (request.enableWebTools) {
    const { content, sources, toolActivities } = await runWebAgent(
      request,
      model,
      models,
    );
    writeResponse({ ok: true, content, sources, toolActivities });
    return;
  }

  const response = await models.completeSimple(
    model,
    {
      systemPrompt: request.systemPrompt,
      messages: [
        {
          role: "user",
          content: request.userPrompt,
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: request.apiKey,
      timeoutMs: 90_000,
      maxRetries: 1,
    },
  );

  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(response.errorMessage || "Pi Runtime 调用失败");
  }

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) {
    throw new Error("Pi Runtime 没有返回文本内容");
  }

  writeResponse({ ok: true, content: text });
}

async function runWebAgent(
  request: RuntimeRequest,
  model: Model<Api>,
  models: ReturnType<typeof createModels>,
): Promise<{ content: string; sources: WebSource[]; toolActivities: ToolActivity[] }> {
  const searchedSources: WebSource[] = [];
  const fetchedSources: WebSource[] = [];
  const toolActivities: ToolActivity[] = [];
  const activityByCallId = new Map<string, number>();
  let turns = 0;
  let toolCalls = 0;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 120_000);

  const handleEvent = (event: AgentEvent) => {
    if (event.type === "turn_end") turns += 1;
    if (event.type === "tool_execution_start") {
      toolCalls += 1;
      const args = event.args as { query?: string; url?: string };
      const kind = event.toolName === "web_fetch" ? "fetch" : "search";
      activityByCallId.set(event.toolCallId, toolActivities.length);
      toolActivities.push({
        kind,
        status: "completed",
        label: kind === "search" ? "已联网搜索" : "已读取网页",
        query: typeof args?.query === "string" ? args.query : undefined,
        url: typeof args?.url === "string" ? args.url : undefined,
      });
      return;
    }
    if (event.type === "tool_execution_end") {
      const index = activityByCallId.get(event.toolCallId);
      if (index !== undefined && event.isError) {
        toolActivities[index] = {
          ...toolActivities[index],
          status: "failed",
          label: toolActivities[index].kind === "search" ? "搜索失败" : "网页读取失败",
        };
      }
      const details = event.result?.details as WebToolDetails | undefined;
      if (details?.sources) {
        if (details.kind === "fetch") fetchedSources.push(...details.sources);
        else searchedSources.push(...details.sources);
      }
    }
  };

  try {
    const newMessages = await runAgentLoop(
      [
        {
          role: "user",
          content: request.userPrompt,
          timestamp: Date.now(),
        },
      ],
      {
        systemPrompt: `${request.systemPrompt}\n当前日期：${new Date().toISOString().slice(0, 10)}。用户询问“最新、今天、近期”时，搜索词和判断必须以这个日期为准，并明确区分事件发生日期与网页发布日期。`,
        messages: [],
        tools: createWebTools(),
      },
      {
        model,
        apiKey: request.apiKey,
        timeoutMs: 90_000,
        maxRetries: 1,
        convertToLlm: (messages) => messages as Message[],
        beforeToolCall: async () =>
          toolCalls >= 6
            ? { block: true, reason: "本轮联网工具调用已达到 6 次，请根据现有结果作答。" }
            : undefined,
        shouldStopAfterTurn: ({ toolResults }) => turns >= 8 && toolResults.length === 0,
        prepareNextTurn: ({ context }) =>
          toolCalls >= 6
            ? {
                context: {
                  ...context,
                  tools: [],
                },
              }
            : undefined,
        toolExecution: "sequential",
      },
      handleEvent,
      abortController.signal,
      (activeModel, context, options) =>
        models.streamSimple(activeModel, context, {
          ...options,
          apiKey: request.apiKey,
          timeoutMs: 90_000,
          maxRetries: 1,
        }),
    );

    const finalMessage = [...newMessages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (!finalMessage || finalMessage.role !== "assistant") {
      throw new Error("Pi Agent 没有返回回答");
    }
    if (finalMessage.stopReason === "error" || finalMessage.stopReason === "aborted") {
      throw new Error(finalMessage.errorMessage || "Pi Agent 调用失败");
    }
    const rawContent = finalMessage.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!rawContent) throw new Error("Pi Agent 没有返回文本内容");
    const content = normalizeAgentJson(rawContent);
    return {
      content,
      sources: deduplicateSources([...fetchedSources, ...searchedSources]).slice(0, 8),
      toolActivities,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAgentJson(content: string): string {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(withoutFence) as { answer?: unknown };
    if (typeof parsed?.answer === "string" && parsed.answer.trim()) {
      return JSON.stringify(parsed);
    }
  } catch {
    // Some OpenAI-compatible models ignore the JSON-only instruction after tool use.
  }
  return JSON.stringify({ answer: withoutFence });
}

function readRequestLine(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = createInterface({ input: process.stdin, terminal: false });
    input.once("line", (line) => {
      resolve(line);
      input.close();
    });
    input.once("close", () => reject(new Error("Pi Runtime 没有收到请求")));
  });
}

function validateRequest(input: Partial<RuntimeRequest>): RuntimeRequest {
  for (const field of [
    "provider",
    "baseUrl",
    "model",
    "apiKey",
    "systemPrompt",
    "userPrompt",
  ] as const) {
    if (typeof input[field] !== "string" || !input[field]?.trim()) {
      throw new Error(`Pi Runtime 请求缺少 ${field}`);
    }
  }
  return input as RuntimeRequest;
}

function writeResponse(response: object) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

void main().catch((error: unknown) => {
  writeResponse({
    ok: false,
    error: error instanceof Error ? error.message : "Pi Runtime 未知错误",
  });
  process.exitCode = 1;
});
