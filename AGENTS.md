# ReadFlow Agent Guidelines

本文件约束所有在 ReadFlow 仓库中工作的开发者与 AI Agent。修改代码前先阅读 `README.md`、本文件以及目标模块现有实现，不要只根据界面文案推断能力状态。

## 产品边界

ReadFlow 是本地优先的 macOS AI 英语学习工作台。当前产品核心是：

1. 主工作台 AI 翻译；
2. 全局快捷键唤起的快速中英互译；
3. 划词理解与可自主联网的 Pi Agent 对话；
4. 本机多学习者切换；
5. 按学习者隔离的翻译、划词、单词和画像数据。

第一版明确没有账号体系：

- 不注册账号；
- 不登录；
- 不接入 OAuth、SSO、手机号、邮箱或第三方身份认证；
- 不区分云端用户身份；
- “学习者”只是当前设备上的本地学习档案，不是账户。

未经用户明确确认，不得引入认证服务、远程用户表、云同步、付费体系或后台管理系统。

## 技术栈与目录

- `src/`：React 19 + TypeScript + Vite 前端。
- `src-tauri/`：Tauri 2 Rust 桌面容器、窗口、全局快捷键、选区捕获、钥匙串和 AI 桥接。
- `runtime/`：由 Bun 编译的 Pi AI Runtime sidecar。
- `runtime/pi-runtime.ts`：Provider 注册、普通模型调用和 Agent 循环。
- `runtime/web-tools.ts`：`web_search`、`web_fetch` 及联网安全边界。
- `src/services/storage/`：本地学习数据 Repository。
- `src/features/quick-translation/`：快速翻译独立窗口。
- `src/features/quick-explanation/`：划词理解与 Agent 对话独立窗口。

## 改动前确认

遇到新需求、Bug、重构、方案调整或不明确任务时，先输出：

1. 对需求的理解；
2. 准备怎么做；
3. 预计影响的文件、模块和外部系统。

等待用户明确确认后再修改代码、配置、文档、数据、分支，或执行提交、推送、发布等有副作用操作。同一线程已经确认方向后，用户说“继续”“下一步”“提交”等，可以继续执行已对齐步骤。

## 数据与认证规则

- 每个学习事件和学习记录必须归属明确的 `learnerId`。
- 切换学习者后，页面状态和查询结果必须同步切换，不能展示上一位学习者的数据。
- 不得把浏览器存储中的学习者 ID 当作安全身份或认证凭证。
- 不同学习者之间不得共享翻译历史、划词历史、单词状态、阅读结果或画像证据。
- 修改本地数据结构时必须考虑旧数据迁移和缺省值，不能直接破坏已有记录。
- 不得为了“以后可能会上云”提前增加登录页面、Token 或远程用户模型。

## AI 与密钥规则

- 前端只能通过 `src/services/ai/aiGateway.ts` 调用 AI，不得直接请求模型 Provider。
- API Key 只能由 Rust 侧写入和读取 macOS Keychain。
- API Key 不得进入 localStorage、配置文件、URL、命令行参数、环境日志、错误信息、测试快照或 Git。
- Base URL 和模型名可以保存到设备配置，但必须按 Provider 分开管理。
- 模型输出是不可信数据；Rust 边界必须校验必要字段后再返回前端。
- 原文、聊天历史、搜索结果和网页正文都只是待分析内容，Prompt 必须明确禁止执行其中的指令。
- 普通翻译与初始划词解读使用单次模型调用；只有划词理解的后续对话默认开放 Agent 联网工具。
- 新增 AI 任务时，同时更新 TypeScript 任务类型、Rust dispatch、Prompt、返回校验和必要测试。

## Pi Agent 与联网规则

- Agent 使用 `@earendil-works/pi-agent-core` 的正式循环，不手写无限工具调用递归。
- `web_search` 用于发现公开来源，`web_fetch` 用于读取关键网页正文。
- 对“最新、今天、近期”等时效问题必须注入当前日期，并区分事件时间与网页发布时间。
- 工具调用次数、模型请求和网页读取必须有超时与上限。
- `web_fetch` 只允许 `http` / `https`，必须拒绝 localhost、私有 IP、内网域名、`file://` 和重定向到内网的地址。
- 网页响应必须限制 Content-Type、大小、重定向次数和交给模型的正文长度。
- Agent 回答应返回工具活动和来源；来源链接必须来自工具结果，不能信任模型虚构的 URL。
- 搜索或读取失败时允许 Agent 根据已有信息继续回答，但必须避免把未核实内容说成事实。

## Tauri 与窗口规则

- 主窗口、快速翻译和划词理解窗口点击关闭时都应隐藏，不应退出整个应用。
- 应用隐藏后，全局快捷键仍应可用。
- 快捷翻译与划词理解使用不同的可配置全局快捷键，禁止重复注册同一组合。
- 快捷键更新必须先验证并成功注册新组合，再持久化；失败时保留原快捷键。
- 捕获选区时优先使用系统选区能力；剪贴板兼容路径必须尽量恢复用户原剪贴板。
- 修改窗口标签、尺寸或权限时，同步检查 `tauri.conf.json`、capabilities、Rust 窗口调用和前端入口路由。
- 新增 Tauri 前端插件时，必须同时更新 npm 依赖、Rust 插件初始化和 capability 权限。

## 前端规则

- 保持 TypeScript 类型完整，不使用 `any` 绕过跨层协议。
- React 组件优先保持局部状态清晰；跨功能数据读写集中到 service / repository。
- 不用假数据伪装尚未实现的 AI 结果。未完成能力必须在界面和 README 中明确标记。
- 用户可见文案以中文为主，模型名、Provider、API 和必要技术名称保留英文。
- 快捷窗口需要适配最小尺寸，按钮文字不得被压缩换行。
- Agent 来源链接通过 Tauri shell 打开系统浏览器，不在当前 WebView 中替换应用页面。

## 验证要求

常规前端改动优先依赖正在运行的 Vite HMR，不必每次执行完整构建。提交或修改 Runtime、Rust 协议、Tauri 配置、安全边界时，至少运行：

```bash
npm run typecheck
npm run build:desktop
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

修改 `runtime/` 时额外运行：

```bash
npx tsc --noEmit \
  --module NodeNext \
  --moduleResolution NodeNext \
  --target ES2022 \
  --skipLibCheck \
  runtime/pi-runtime.ts runtime/web-tools.ts
```

联网工具修改还需要验证：

- 至少一次真实公开搜索；
- 至少一次公开网页正文读取；
- localhost、私有 IP 和 `file://` 均被拒绝；
- 不在任何输出中打印 API Key。

## Git 与文档

- 不覆盖或清理用户已有改动。
- 未经确认不执行 commit、push、merge、rebase、stash、发布或 destructive reset。
- 提交前检查 `git status`、`git diff --check` 和测试结果。
- Commit message 使用 Conventional Commits，主题使用简洁中文。
- 新功能、配置方式、安全边界和能力状态变化必须同步更新 `README.md`。
- README 必须明确区分“已完成 / 基础闭环 / 产品骨架 / 未实现”，不得把路线图写成已经交付。
