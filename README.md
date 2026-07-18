# ReadFlow

ReadFlow 是一个 AI 原生、本地优先的 macOS 英语学习工作台。它把日常遇到的英文内容变成可持续积累的学习记录：快速翻译、划词理解、候选词确认、学习历史以及面向不同学习者的独立档案。

当前版本是可以本地运行的第一版产品，重点完成了翻译与划词理解闭环。单词本已经可以接收翻译过程中确认的词汇；阅读理解和 AI 英语画像保留了产品入口，完整 AI 闭环仍在后续开发中。

## 下载

前往 [GitHub Releases](https://github.com/Voice-2026/ReadFlow/releases) 下载最新的 macOS 安装包。

当前最新版本为 `v0.1.1`，提供 Apple Silicon 版本，适用于 M1、M2、M3、M4 及后续 Apple 芯片 Mac：

1. 下载 `ReadFlow_0.1.1_aarch64.dmg`；
2. 打开 DMG，将 ReadFlow 拖入“应用程序”；
3. 首次启动后，在应用设置中配置自己的模型 API Key；
4. 按照下方说明授予辅助功能权限，才能从其他应用捕获选中文字。

当前安装包尚未使用 Apple Developer ID 签名和公证。如果 macOS 阻止首次打开，请在 Finder 中右键 ReadFlow，选择“打开”；或者前往“系统设置 → 隐私与安全性”，确认允许打开。请只从本项目 GitHub Release 下载应用。

## 已实现功能

### 快捷翻译

- 默认全局快捷键：`⌘ ⇧ Space`，可在设置中重新录制。
- 从任意应用捕获当前选中文字，在独立窗口中自动中英互译。
- 快捷窗口默认不置顶，可在右上角随时切换置顶状态。
- 没有捕获到新选区时，继续显示上一次翻译内容。
- 支持复制译文、转入主工作台以及最近 100 条翻译历史。
- 主工作台支持自然翻译、直译和解释表达三种模式。
- AI 会同时生成自然译文、主要表达、逐句结构、逻辑关系和候选词汇。
- 支持读取 `.txt`、`.md` 文件；PDF 文本提取尚未接入。

### 划词理解与 Pi Agent

- 默认全局快捷键：`⌘ ⇧ E`，可单独配置。
- 使用 `1300 × 1000` 三栏独立窗口展示历史、原文解读和后续对话。
- 对中文、英文或混合内容统一使用中文解释，不只是逐字翻译。
- 输出主旨、详细解读、关键信息、关键表达、语气与隐含意图。
- 保留最近 100 条划词理解历史；没有新选区时恢复上一次内容。
- 右侧对话由 `@earendil-works/pi-agent-core` 驱动，可自主决定是否调用：
  - `web_search`：搜索公开互联网；
  - `web_fetch`：读取关键网页并核对正文。
- 对“今天、最新、近期”等问题自动注入当前日期。
- 回答中展示 Agent 工具活动和可点击的参考来源。
- 联网搜索不需要额外搜索 API Key；模型调用仍使用用户配置的模型服务。

### 本机多学习者

- 无账号、无登录、无认证，打开应用即可使用。
- 可在本机创建和切换多个学习者。
- 每位学习者拥有独立的翻译记录、划词历史、单词状态和学习档案。
- AI 推荐的候选词必须由学习者确认“认识 / 模糊 / 不认识”后才进入单词本。

“学习者”只是本机学习档案，不是用户账户，也不具备密码、Token、权限或云端身份。第一版不会接入 OAuth、SSO、手机号或邮箱认证。

### 多模型配置

- 支持 OpenAI、Anthropic、Google Gemini、OpenRouter、DeepSeek 和 OpenAI-compatible 服务。
- 每个 Provider 分别保存 Base URL、模型名称和 API Key 状态，切换后自动回显。
- 支持测试连接、修改已有配置以及单独清除 API Key。
- API Key 只保存在 macOS 钥匙串，不写入前端存储、配置文件、命令行参数或日志。

## 当前边界

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 主工作台翻译 | 已完成 | 文本和 `.txt` / `.md` 文件翻译、结构分析、候选词确认 |
| 快捷翻译 | 已完成 | 全局快捷键、独立窗口、历史记录、恢复上次内容 |
| 划词理解 | 已完成 | 中文解读、历史记录、后续聊天、Agent 联网搜索 |
| 单词本 | 基础闭环 | 展示翻译过程中由学习者确认的词汇及掌握状态 |
| 阅读理解 | 产品骨架 | 生成材料、用户翻译和主旨表达的 AI 评估尚未接通 |
| AI 英语画像 | 产品骨架 | 已定义画像维度，增量证据更新尚未接通 |
| PDF 解析 | 未实现 | 当前选择 PDF 时只显示能力提示 |
| macOS 安装包 | 已完成 | GitHub Release 提供未签名的 Apple Silicon `.dmg` |
| 自动更新 | 未实现 | 当前需要手动下载新版安装包 |

## 技术架构

```text
React + TypeScript
        │
        │ Tauri invoke / event
        ▼
Tauri 2 (Rust)
        │
        │ stdin / stdout JSON
        ▼
Pi AI Runtime sidecar (Bun)
        ├── @earendil-works/pi-ai
        ├── @earendil-works/pi-agent-core
        ├── web_search
        └── web_fetch
```

- 前端：React 19、TypeScript、Vite。
- 桌面容器：Tauri 2、Rust。
- 模型适配：`@earendil-works/pi-ai`。
- Agent 循环：`@earendil-works/pi-agent-core`。
- Runtime：由 Bun 编译为 Tauri sidecar，API Key 通过 stdin 请求传递。
- 本地数据：按照 `learnerId` 隔离的浏览器存储与 Tauri 设备配置。
- 凭证：macOS Keychain。

## 本地运行

### 环境要求

- macOS
- Node.js 22.19 或更高版本
- npm
- Bun
- Rust 工具链
- Xcode Command Line Tools

安装依赖：

```bash
npm install
```

启动 Tauri 桌面开发环境：

```bash
npm run tauri dev
```

该命令会先运行 `npm run runtime:build`，生成与当前平台匹配的 Pi AI Runtime sidecar，然后启动 Vite 和 Tauri。

如只需要查看前端页面：

```bash
npm run dev
```

浏览器模式无法使用全局快捷键、macOS 钥匙串和桌面窗口能力。

## 配置 AI

推荐在应用中打开“设置 → Pi AI Runtime”，选择 Provider 后填写：

1. Base URL
2. 模型名称
3. API Key
4. 点击“保存 AI 配置”
5. 点击“测试连接”

DeepSeek 默认配置：

```text
Base URL: https://api.deepseek.com
Model: deepseek-v4-flash
```

也可以通过启动环境变量提供设备级配置：

```bash
export READFLOW_AI_API_KEY="你的密钥"
export READFLOW_AI_PROVIDER="openai-compatible"
export READFLOW_AI_MODEL="模型名称"
export READFLOW_AI_BASE_URL="https://api.openai.com/v1"
npm run tauri dev
```

选择 `openai-compatible` 时，目标服务需要实现 OpenAI Chat Completions 协议。非本机 Base URL 必须使用 HTTPS，本机模型可以使用 `http://localhost`。

## macOS 权限

首次使用划词或快捷翻译时，macOS 可能要求辅助功能权限。请打开：

```text
系统设置 → 隐私与安全性 → 辅助功能 → ReadFlow
```

ReadFlow 会先尝试读取当前选区；兼容路径会短暂使用剪贴板，并在读取后恢复原内容。关闭主窗口或快捷窗口时应用会隐藏到后台，全局快捷键仍可继续唤起窗口。

## 联网与安全边界

- 只有划词理解的后续 Agent 对话具备联网工具，普通翻译和初始解读不会自动搜索。
- `web_fetch` 只允许 `http` / `https`，拒绝 `file://`、localhost、内网地址和私有 IP。
- 网页读取设置了超时、重定向次数、响应大小和正文长度限制。
- 网页正文和搜索结果都被视为不可信数据，不执行其中的指令。
- AI 输入会发送到用户选择的模型 Provider；公开搜索请求会发送到搜索服务和目标网页。
- 不要把真实 API Key 写入 `.env`、源码、Issue 或提交记录。

## 开发检查

```bash
# 前端类型检查
npm run typecheck

# 构建 Runtime 与前端
npm run build:desktop

# Rust 测试
cargo test --manifest-path src-tauri/Cargo.toml

# 单独构建 Pi Runtime
npm run runtime:build
```

## 主要目录

```text
runtime/                         Pi Agent Runtime 与联网工具
src/app/                         主应用与学习者状态
src/features/quick-translation/  快捷翻译窗口
src/features/quick-explanation/  划词理解与 Agent 对话窗口
src/features/translation/        主翻译工作台
src/features/settings/           快捷键与多 Provider 配置
src/services/storage/            本地学习记录 Repository
src-tauri/src/                   Tauri 命令、快捷键、选区捕获与 AI 桥接
```

## 下一步

- 完成阅读理解的“AI 出题 → 学习者翻译与概括 → AI 评估”闭环。
- 根据翻译、阅读、查词和复习行为持续更新学习者画像。
- 增加基于遗忘曲线的单词复习流程。
- 接入 PDF 文本提取。
- 增加 Intel / Universal 构建、Developer ID 签名、公证和自动更新。

## 隐私说明

ReadFlow 当前没有账号体系，也不会把不同学习者的数据混在一起。学习档案和学习记录默认保存在本机；模型请求和 Agent 联网请求是唯一会离开设备的数据。使用前请根据所选 Provider 的隐私政策判断是否适合发送相关内容。
