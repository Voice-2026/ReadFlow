import { access, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const args = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!name?.startsWith("--") || !value || value.startsWith("--")) {
    throw new Error("参数必须使用 --名称 值 的形式传入");
  }
  args[name.slice(2)] = value;
}

const required = ["version", "signature", "output"];
const missing = required.filter((name) => !args[name] || args[name].startsWith("--"));
if (missing.length > 0) {
  throw new Error(`缺少参数：${missing.map((name) => `--${name}`).join("、")}`);
}

const version = args.version.replace(/^v/, "");
const tag = args.tag ?? `v${version}`;
const archivePath = resolve(args.archive ?? "src-tauri/target/release/bundle/macos/ReadFlow.app.tar.gz");
const signaturePath = resolve(args.signature);
await access(archivePath);
const signature = (await readFile(signaturePath, "utf8")).trim();
if (!signature) throw new Error("更新包签名为空");
const archiveName = basename(archivePath);
const notes = args.notes ?? "ReadFlow 新版本";
const repository = "https://github.com/Voice-2026/ReadFlow/releases/download";

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "darwin-aarch64": {
      signature,
      url: `${repository}/${tag}/${archiveName}`,
    },
  },
};

await writeFile(resolve(args.output), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`已生成 ${args.output}`);
