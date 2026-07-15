# 首页 Hero 标题字号调整 Design QA

**Source visual truth path**

`/var/folders/v1/wysdcqyx3kq6dknz5qzzwgb40000gn/T/codex-clipboard-484267ac-fcda-4034-9b68-7d74d422e8ca.png`

源截图中的问题标注：主标题字号过大，在当前宽度下换成两行；目标是缩小字号并保持桌面窗口单行。

**Implementation screenshot path**

`/tmp/readflow-hero-smaller.png`

**Viewport**

- Source crop: 1047 × 345 px
- Implementation: 1592 × 1045 pt Tauri 窗口
- Hero 对照统一归一化为 1047 × 345 px

**State**

- macOS 桌面端首页
- Hero 默认状态
- 当前学习者为本机真实数据，因此 eyebrow 和学习目标内容与源截图不同

**Full-view comparison evidence**

`/tmp/readflow-hero-font-comparison.png`

Hero 组件前后并排对照显示，标题已由两行变为一行，卡片高度随之收紧；副标题和主按钮仍保持原有层级和可见性。

**Focused region comparison evidence**

`/tmp/readflow-hero-title-focus-comparison.png`

聚焦标题与副标题的对照确认：桌面宽度下标题无溢出、无裁切、无换行，中文宋体风格和字重保持不变。

**Findings**

- 未发现可执行的 P0、P1 或 P2 问题。
- 字体与排版：Hero 标题使用 `clamp(30px, 2.8vw, 40px)`，行高 1.12；桌面状态保持单行，900px 以下恢复自然换行。
- 间距与布局节奏：字号缩小后卡片高度更紧凑，标题、副标题与按钮之间的视觉平衡正常。
- 色彩与视觉 token：未修改颜色、边框、阴影或背景 token。
- 图片与资源质量：该区域无图片资源，本次没有新增或替换资产。
- 文案与内容：标题和副标题文案未修改；截图中的学习者差异来自真实本机数据。
- 响应式：宽窗口单行；窄于 900px 时 Hero 改为纵向布局并允许标题换行，避免横向溢出。

**Open Questions**

- 无阻塞问题。

**Comparison History**

- Pass 1: 源截图中主标题为两行，属于本次 P2 排版问题。
- Fix: 移除 760px 标题宽度限制，降低响应式字号，桌面保持单行，并增加 900px 以下的安全回退布局。
- Pass 2: Tauri 实机截图确认标题单行，按钮和副标题未受影响，P2 已关闭。

**Implementation Checklist**

- [x] 缩小 Hero 标题字号
- [x] 桌面窗口保持单行
- [x] 小窗口允许安全换行
- [x] 保留原有字体、颜色和功能
- [x] 完成 Tauri 实机截图对照

**Follow-up Polish**

- 无。

**final result: passed**
