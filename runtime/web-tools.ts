import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

const SEARCH_ENDPOINT = "https://lite.duckduckgo.com/lite/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ReadFlow/0.1";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_PAGE_TEXT = 14_000;

export type WebSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type WebToolDetails = {
  kind: "search" | "fetch";
  query?: string;
  url?: string;
  sources: WebSource[];
};

export function createWebTools(): AgentTool[] {
  const webSearch: AgentTool = {
    name: "web_search",
    label: "联网搜索",
    description:
      "搜索公开互联网。遇到最新动态、新闻、时效性事实、原文未提供的信息或需要外部核实时使用。返回标题、链接和摘要。",
    parameters: Type.Object({
      query: Type.String({ description: "具体、可检索的搜索关键词" }),
      maxResults: Type.Optional(
        Type.Integer({ minimum: 1, maximum: 8, description: "返回结果数量，默认 5" }),
      ),
    }),
    execute: async (_toolCallId, rawParams, signal) => {
      const params = rawParams as { query: string; maxResults?: number };
      const query = params.query.trim();
      if (!query) throw new Error("搜索关键词不能为空");

      const sources = await searchWeb(query, params.maxResults ?? 5, signal);
      const details: WebToolDetails = { kind: "search", query, sources };
      return {
        content: [
          {
            type: "text",
            text:
              sources.length > 0
                ? JSON.stringify({ query, results: sources }, null, 2)
                : `没有找到与“${query}”相关的公开网页结果。`,
          },
        ],
        details,
      };
    },
  };

  const webFetch: AgentTool = {
    name: "web_fetch",
    label: "读取网页",
    description:
      "读取公开网页正文。通常先用 web_search 找到可靠来源，再用本工具打开关键页面核对细节。不能访问本机或内网地址。",
    parameters: Type.Object({
      url: Type.String({ description: "要读取的完整 http 或 https 网页地址" }),
    }),
    execute: async (_toolCallId, rawParams, signal) => {
      const params = rawParams as { url: string };
      const page = await fetchWebPage(params.url, signal);
      const source: WebSource = { title: page.title, url: page.url };
      const details: WebToolDetails = {
        kind: "fetch",
        url: page.url,
        sources: [source],
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { title: page.title, url: page.url, content: page.content },
              null,
              2,
            ),
          },
        ],
        details,
      };
    },
  };

  return [webSearch, webFetch];
}

export async function searchWeb(
  query: string,
  maxResults = 5,
  signal?: AbortSignal,
): Promise<WebSource[]> {
  const searchUrl = new URL(SEARCH_ENDPOINT);
  searchUrl.searchParams.set("q", query);
  const response = await fetch(searchUrl, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    signal: combineSignals(signal, FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`搜索服务返回 ${response.status}`);

  const html = await response.text();
  const results: WebSource[] = [];
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const attributes = match[1];
    const className = attributes.match(/class=["']([^"']+)["']/i)?.[1] ?? "";
    if (!/(?:result__a|result-link)/.test(className)) continue;
    const href = attributes.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const rawUrl = decodeHtml(href);
    const url = unwrapDuckDuckGoUrl(rawUrl);
    if (!url || !/^https?:\/\//i.test(url)) continue;

    const following = html.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 3_000);
    const snippetMatch = following.match(
      /<(?:a|td)[^>]*class=["'][^"']*(?:result__snippet|result-snippet)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|td)>/i,
    );
    results.push({
      title: cleanText(match[2]) || url,
      url,
      snippet: snippetMatch ? cleanText(snippetMatch[1]) : undefined,
    });
    if (results.length >= Math.min(Math.max(maxResults, 1), 8)) break;
  }
  return deduplicateSources(results);
}

export async function fetchWebPage(
  inputUrl: string,
  signal?: AbortSignal,
): Promise<{ title: string; url: string; content: string }> {
  let url = await validatePublicUrl(inputUrl);
  let response: Response | undefined;

  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    response = await fetch(url, {
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: combineSignals(signal, FETCH_TIMEOUT_MS),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) throw new Error("网页重定向缺少目标地址");
    url = await validatePublicUrl(new URL(location, url).toString());
    response = undefined;
  }

  if (!response) throw new Error("网页重定向次数过多");
  if (!response.ok) throw new Error(`网页返回 ${response.status}`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType && !contentType.includes("text/") && !contentType.includes("html")) {
    throw new Error(`暂不读取这种网页类型：${contentType.split(";")[0]}`);
  }

  const html = await readLimitedText(response, MAX_PAGE_BYTES);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? cleanText(titleMatch[1]) : new URL(url).hostname;
  const content = extractPageText(html).slice(0, MAX_PAGE_TEXT);
  if (!content) throw new Error("网页没有可读取的正文");
  return { title, url, content };
}

export function deduplicateSources(sources: WebSource[]): WebSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.url.replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function validatePublicUrl(input: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("网页地址无效");
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("只允许读取 http 或 https 网页");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("不能读取本机或内网地址");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("不能读取本机或内网地址");
  } else {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error("不能读取本机或内网地址");
    }
  }
  url.hash = "";
  return url.toString();
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.includes(":")) {
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPrivateAddress(mapped) : false;
  }
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

async function readLimitedText(response: Response, limit: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new Error("网页内容过大，已停止读取");
  }
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("网页内容过大，已停止读取");
    }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

function extractPageText(html: string): string {
  return decodeHtml(
    html
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<(script|style|svg|noscript|form|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|article|section|main|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function unwrapDuckDuckGoUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl, "https://duckduckgo.com");
    if (url.hostname.endsWith("duckduckgo.com") && url.pathname.startsWith("/l/")) {
      return url.searchParams.get("uddg");
    }
    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named[code.toLowerCase()] ?? entity;
  });
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}
