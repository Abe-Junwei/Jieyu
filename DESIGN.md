# DESIGN.md — Jieyu 设计交接（Stitch / Agent）

本文件位于仓库根目录，供 **Cursor / Claude / 其他 Agent** 与 **Google Stitch** 等工具对齐视觉意图时使用。

## 事实源优先级（必读）

1. **工程事实源（最高）**：`src/styles/tokens.css` 与 `src/utils/theme.ts`。组件与面板样式应优先使用其中的语义变量（`var(--…)`），并与 `docs/architecture/CSS架构与模板复用规范.md` 的分层与命名一致。
2. **本文件**：描述「设计意图、模块级说明、Stitch 导出片段」；若与 `tokens.css` 冲突，**以代码与 token 为准**，并应回写修正本文件或 Stitch 项目，避免双源漂移。
3. **产品文案**：用户可见字符串须走 i18n（`dictKeys`、词典），不得把 Stitch 稿中的英文直接硬编码进 UI。

## Jieyu 语义 token 映射（Stitch → 仓库）

将 Stitch 稿中的「表面 / 文字 / 边框 / 强调」映射到下列变量；**禁止**在业务组件中随意新增与下表无关的裸 hex（若确需新色，应扩展 `tokens.css` 并更新本表）。

| 设计语义（示例） | 仓库 CSS 变量（优先） | 说明 |
|------------------|----------------------|------|
| 页面/工作区底色 | `--surface-bg` | 大面积背景 |
| 卡片/面板底色 | `--surface-panel` | 主内容容器 |
| 顶栏/条带背景 | `--surface-header` | 区域标题栏等 |
| 浮层/抬高表面 | `--surface-elevated` | 悬浮卡片感 |
| 遮罩/对话框衬底 | `--surface-overlay` | 模态下层等 |
| 弱分隔边框 | `--border-subtle` | 轻分割 |
| 常规边框 | `--border-soft` | 默认描边 |
| 强调边框 | `--border-strong` | 更明显边界 |
| 主文案 | `--text-primary` | 标题与正文主色 |
| 次文案 | `--text-secondary` | 辅助说明 |
| 三级/弱化文案 | `--text-tertiary` | 提示、禁用感等 |
| 主题强调色（随 accent 变） | `--theme-accent-solid` | 与 `data-theme-accent` 联动 |
| 成功/警告/信息等功能色 | `--state-success-*`、`--state-warning-*` 等 | 以 `tokens.css` 中 `state-*` 为准 |

主题外观（整盘配色）由 `data-appearance` / `data-theme` 控制，枚举与展示文案见 `src/utils/theme.ts`；Stitch 中若定义「新皮肤」，属产品级变更，须同步主题枚举与 `tokens.css`，不可仅改局部 hex。

## 布局与 CSS 纪律（与 Agent 约定）

- 新面板/对话框：优先 `npm run scaffold:ui-surface`，样式落在 `src/styles/panels/*`，遵守 `pnl-*` 与 BEM 式块命名（见 CSS 架构规范）。
- **面板视觉层级**：同一路径上可见容器 **border 最多两层**；更深层级用背景色与间距区分（见仓库 `AGENTS.md` / 解语 Copilot 约束）。
- 合并前至少关注：`npm run check:css-architecture`、`check:panel-foundation` 或与改动范围匹配的 gate。

## 转写页聊天与侧栏

- 聊天在 `src/pages/TranscriptionPage.ChatWindow.tsx`，不是右侧栏里的嵌入页。
- 右侧栏 `src/pages/TranscriptionPage.AiSidebar.tsx` 组装分析。
- 改这两处的外观仍走上面的 token、i18n 和两层边框。聊天样式看 `src/styles/pages/ai-chat-window.css`。

---

## 以下为 Stitch / 人工维护的设计说明区

将 **Google Stitch** 导出的 `DESIGN.md` 片段、或模块级说明粘贴到下方；保持「上表映射 + 下文细节」结构，便于 `@DESIGN.md` 引用。

<!-- stitch-export-start -->

（在此粘贴 Stitch 设计系统导出内容，或按迭代补充屏幕说明、间距标尺、组件状态表。）

<!-- stitch-export-end -->
