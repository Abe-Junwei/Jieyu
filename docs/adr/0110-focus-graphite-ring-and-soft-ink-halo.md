---
title: ADR 0110 - 设计系统焦点态改为铅笔石墨细外环与输入淡墨晕
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0103-paper-field-notes-is-the-only-appearance.md
  - ./0106-design-system-package-lives-in-repo.md
  - ./0108-control-border-contrast-3-to-1.md
---

# ADR 0110：设计系统焦点态改为铅笔石墨细外环与输入淡墨晕

## 背景

`design/jieyu-paper/` 原先规定所有控件聚焦统一使用 `2px 纸色间隔 + 2px 纯黑 #111111（暗 #F4F2EC）` 的外扩 `box-shadow`：

- 输入框、下拉框和表格行内编辑格本身已有 1px 边框，叠上外环后变成 5px 双黑套框，靶心感强；
- 次要按钮和无边框图标按钮聚焦时出现粗黑外框，视觉重量压过墨色主按钮；
- 纯 `box-shadow` 焦点环在系统高对比模式（`forced-colors`）下会被剥离。

## 决定

局部替换 [ADR-0103](./0103-paper-field-notes-is-the-only-appearance.md) 第 2 条与 `DESIGN.md` 中「2px 纯黑外环」的表述，设计系统采用 **C + A 混搭**焦点态：

1. **按钮与独立控件用 1.5px 铅笔石墨细外环（`--focus-color`）**：亮色 `#5c5c5c`（对纸面 `#ffffff` 为 6.69:1），暗色 `#9e998f`（对纸页 `#161614` 为 6.39:1）。按钮、复选框、单选框、图标按钮用 `outline: 1.5px solid var(--focus-color); outline-offset: 2px;`；贴边防裁切容器（标签页、时间轴块）内缩 `outline-offset: -1.5px`。
2. **输入类控件用单层深边 + 3px 淡墨晕（`--focus-ring`）**：输入框、文本域、下拉框、IGT／表格行内编辑格不画外圈第二道框，将自身 1px 边框加深到次墨 `--fg-2`（亮 `#3a3a3a`、暗 `#c8c4ba`），并叠加柔和光晕 `--focus-ring`（亮 `0 0 0 3px rgb(17 17 17 / 14%)`、暗 `0 0 0 3px rgb(244 242 236 / 18%)`）。错误态聚焦保留红边 `--danger` 并切换为 `--focus-ring-danger`。
3. **门禁守卫**：`scripts/build-od-design-tokens.mjs --check` 校验亮、暗两套 `--focus-color` 对 `--surface` 的对比度均 ≥ 3:1。
4. **落地边界**：本轮只更新设计系统包 `design/jieyu-paper/` 及其 token 生成定义，不动应用代码 `src/`；产品侧样式在后续各工作区切片重设计时按本设计系统逐片接入。

## 未选方案

- **全控件只用半透明淡墨晕（纯方案 A）**：实心主按钮与无框图标按钮外侧缺少 ≥ 3:1 实边，不满足 WCAG 1.4.11，且高对比模式不可见。
- **改用次要靛青 `#312C85` / `#B6B2F2` 作专用焦点色（方案 B）**：能与黑底主按钮区分，但引入彩色外框，打破纸本无彩色主调。
- **保留 2px 纯黑双环**：在表单密集页与工具栏里过重喧宾夺主。

## 影响

- Open Design 中 `user:jieyu-paper` 及 20 张组件预览页立即切换为新焦点态。
- 应用 `src/styles/` 暂保持原状，随各工作区精稿切片落地时同步收口。
