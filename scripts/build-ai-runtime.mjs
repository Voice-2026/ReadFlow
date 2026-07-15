import { chmodSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const triples = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "win32-x64": "x86_64-pc-windows-msvc",
};

const platform = `${process.platform}-${process.arch}`;
const triple = triples[platform];
if (!triple) {
  throw new Error(`暂不支持为 ${platform} 构建 ReadFlow AI Runtime`);
}

const extension = process.platform === "win32" ? ".exe" : "";
const output = resolve(`src-tauri/binaries/readflow-ai-runtime-${triple}${extension}`);
mkdirSync(dirname(output), { recursive: true });

const result = spawnSync(
  "bun",
  [
    "build",
    "runtime/pi-runtime.ts",
    "--compile",
    "--minify",
    "--outfile",
    output,
  ],
  { stdio: "inherit" },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (process.platform !== "win32") chmodSync(output, 0o755);
