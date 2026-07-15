# ReadFlow

ReadFlow 是一个 AI 原生、本地优先的 macOS 英语学习工作台。第一版围绕快捷翻译、智能单词本、阅读理解、AI 英语画像和本机“切换学习者”展开。

## 当前阶段

当前完成 M2 首个 AI 翻译闭环：

- Tauri 2 + Vite + React + TypeScript 工程。
- 首页、翻译器、单词本、阅读理解和 AI 英语画像入口。
- 本机学习者创建与切换。
- 按 `learnerId` 隔离的本地 Repository。
- AI Gateway 接口边界。
- 内置 Pi AI Runtime sidecar，由 Tauri 后端安全调用统一的多 Provider 模型接口。
- 展示自然译文、主要表达、逐句结构、逻辑关系和重点表达。
- 翻译记录按学习者隔离保存，候选词由学习者确认后进入单词本。
- 注册可配置的全局快捷键，默认 `⌘⇧Space`，从其他应用捕获选中文字。
- 使用独立置顶小窗口自动识别中英文并直接互译，可复制结果或转入完整工作台。

PDF 解析和画像增量更新将在后续里程碑接入。当前界面不会用本地假数据冒充 AI 翻译结果。

首次使用选区捕获时，macOS 可能要求辅助功能权限。请在“系统设置 → 隐私与安全性 → 辅助功能”中允许 ReadFlow；选区兼容路径会临时使用剪贴板并在读取后恢复原内容。

快捷键可以在主工作台的“设置”中重新录制。新组合注册成功后立即生效并保存在设备配置目录；若组合键被占用，会保留原快捷键。

## AI 配置

推荐直接在主工作台“设置 → Pi AI Runtime”中选择 Provider，并填写 Base URL、模型名称和 API Key。当前支持 OpenAI、Anthropic、Google Gemini、OpenRouter、DeepSeek 和 OpenAI-compatible 服务。普通配置按 Provider 分别保存在应用配置目录，切换 Provider 时会自动回显；每个 Provider 的 API Key 分别写入 macOS 钥匙串，不会进入前端存储或回显明文。输入新 Key 后保存即可替换，也可以单独清除。

DeepSeek 默认使用 `https://api.deepseek.com` 和 `deepseek-v4-flash`，也可以改为 `deepseek-v4-pro`。旧模型名 `deepseek-chat`、`deepseek-reasoner` 仍可手动填写，但不再作为默认值。

模型调用由应用内置的 `@earendil-works/pi-ai` Runtime 执行。Runtime 在桌面开发和打包前由 Bun 编译成 Tauri sidecar，使用 stdin/stdout 与 Rust 后端交换单次请求；API Key 不会进入命令行参数或 sidecar 环境变量。

仍兼容从启动 ReadFlow 的设备环境读取配置：

```bash
export READFLOW_AI_API_KEY="你的密钥"
export READFLOW_AI_PROVIDER="openai-compatible"
export READFLOW_AI_MODEL="模型名称"
export READFLOW_AI_BASE_URL="https://api.openai.com/v1" # 可选
npm run tauri dev
```

选择 `openai-compatible` 时，服务需要实现 OpenAI Chat Completions 协议。非本机地址必须使用 HTTPS，本机模型可以使用 `http://localhost`。

## 本地运行

```bash
npm install
npm run dev
```

桌面容器开发：

```bash
npm run tauri dev
```

`npm run tauri dev` 会先执行 `npm run runtime:build`，生成与当前平台匹配的 Pi AI Runtime 可执行文件。需要本机已安装 Bun。

基础检查：

```bash
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
```

## 数据边界

- 学习档案和学习记录默认保存在本机。
- 每个学习事件必须归属一个明确的 `learnerId`。
- 设备级 AI 密钥不得进入前端本地存储、Git 或日志。
- 后续接入 AI 时，界面必须明确提示输入内容会发送到用户配置的模型服务。
