---
title: ADR 0108 - 控件边界统一走 border-control 并守住 3:1 对比度
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0103-paper-field-notes-is-the-only-appearance.md
  - ./0106-design-system-package-lives-in-repo.md
---

# ADR 0108：控件边界统一走 border-control 并守住 3:1 对比度

## 背景

重算「纸本田野笔记」对比度基线时，控件边框不满足 WCAG 1.4.11（可识别控件边界 ≥ 3:1）：

- 代码中输入框、下拉框、图标按钮、幽灵按钮大多使用 `--border-soft`（亮 `#e2e2e2` 约 1.29:1）或 `--border-strong`（亮 `#c8c8c8` 1.67:1，暗 `#5c5952` 2.59:1）。
- `tokens.css` 里定义了 `--border-control`（原值亮 `#111111`、暗 `#c8c4ba`），但没有任何组件引用；原值直接用墨色偏重，且会和焦点边混淆。

## 决定

1. **控件专用中灰边框**：`--border-control` 调为刚好跨过面板底色 3:1 的中灰——亮色 `#949494`（对 `#ffffff` 为 3.03:1），暗色 `#6a675f`（对 `#161614` 为 3.21:1）。分隔线与卡片边框（`--border-subtle` / `--border-soft` / `--border-strong`）不变。
2. **适用范围**：输入框、文本域、下拉框、复选框、单选框，以及独立带边框的图标按钮、次要／幽灵按钮统一改用 `--border-control`。悬停未聚焦时加深到 `--text-secondary`。
3. **无边框例外保留**：转写工具栏图标按钮与对话框关闭按钮保持无边框（靠图标和位置识别）。
4. **禁用态退回浅边**：禁用控件不受 WCAG 3:1 约束，边框退回 `--border-soft`，与可用控件一眼区分。
5. **门禁自动拦截**：`scripts/build-od-design-tokens.mjs --check`（含于 `npm run check:docs-governance`）校验亮、暗两套 `--border-control` 对 `--surface` 的 sRGB 对比度均 ≥ 3:1，低于 3:1 直接失败。

## 未选方案

- **维持 `--border-control` 为墨色 `#111111` / `#c8c4ba`**：表单密集区域黑框过重，且常态与焦点态难以拉开层次。
- **直接加深 `--border-strong` 到 3:1**：会把现有约十余处非控件分隔线和容器边一起加深，破坏纸面安静感。
- **记为已知例外不改**：白底输入框配浅灰边在强光屏幕下几乎消失，直接影响长时间校对时的命中判断。

## 影响

- 输入类控件、复选框、单选框、次要／幽灵／带边图标按钮边框明显清晰，分隔线保持原浅度。
- 后续在 `src/styles/tokens.css` 或 Open Design 里把 `--border-control` 改淡于 3:1 时，`check:docs-governance` 会拦截。
