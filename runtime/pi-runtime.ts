import { createInterface } from "node:readline";
import {
  createModels,
  createProvider,
  type Api,
  type Model,
  type ProviderStreams,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";

type RuntimeRequest = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
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
