---
title: ADR 0114 - 克制主题色按 Radix 三档拆分为实心填充、浅底承托与可读文字
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0103-paper-field-notes-is-the-only-appearance.md
  - ./0104-type-space-shadow-and-ink-only-series.md
  - ./0111-icon-usage-and-tag-family.md
  - ./0113-context-sidebar-shallower-step.md
---

# ADR 0114：克制主题色按 Radix 三档拆分为实心填充、浅底承托与可读文字

## 背景

在为「纸本田野笔记」引入克制主题色时，初版直接复用了单文字色 `--mark-secondary`（`--secondary`，亮 `#312C85`、暗 `#B6B2F2`）去承担左轨激活项、复选框／单选／开关开态与进度条。审查发现三处缺陷：

1. **单色值跨角色失配**：亮色 `#312C85` 与墨色 `#111111` 对比度仅 `1.65:1`，在小图标与 16px 勾选框上近乎纯黑；暗色 `#B6B2F2` 属高明度文字色，做实心填充块时发粉刺眼，且勾选字符若用白色对比度仅 `1.97:1`。
2. **左轨激活项缺少浅底承托**：仅着色图标和 2px 边条在 52px 轨上缺少面感。
3. **工具激活态与内容选中态混同**：工具栏切换按钮（循环、吸附）、筛选胶囊开态、滑块填充轨此前与时间轴语段选中共用中性灰，既显得单调，又把「工具已开启」和「当前选中的语料对象」混为一谈。

对照 Radix Colors 12-step 与 VS Code / Linear 桌面规范，成熟做法是把单一主题色拆成 **Step 3 浅底承托、Step 9 实心填充、Step 11 可读文字／图标** 三档，各自承担固定语义角色。

## 决定

1. **局部更新 [ADR-0103](./0103-paper-field-notes-is-the-only-appearance.md) 第 2 条中靛青的适用范围与色阶拆分**，新增三档主题色语义 token（默认色相保持靛青）：
   - **实心填充 `--brand-solid`（OD `--brand`）**：亮 `#4338CA`、暗 `#5B5BD6`，配固定前景 `--brand-on: #FFFFFF`（白字对比度亮 `7.90:1`、暗 `5.37:1`；控件对纸面亮 `7.90:1`、暗 `3.38:1`）。用于复选框／单选／开关开态、进度条填充、连续滑块（音量／缩放）已填充轨、左轨当前项左侧 2px 指示条。
   - **浅底承托 `--brand-tint`（OD `--brand-tint`）**：亮 `#EEEDFB`、暗 `#222038`。用于左轨当前工作区槽底、工具栏 `aria-pressed="true"` 切换开态底（循环、吸附等）、侧栏筛选胶囊 `aria-checked="true"` 开态底。
   - **可读文字与图标 `--mark-secondary`（OD `--secondary`）**：亮 `#3B359E`（较旧 `#312C85` 提亮半档以与纯黑拉开色相差，对白纸 `9.59:1`、对 `--brand-tint` `8.29:1`）、暗 `#B6B2F2`（对纸页 `9.18:1`、对 `--brand-tint` `7.99:1`）。用于左轨当前图标、已开启的工具切换／筛选胶囊前景、正文带下划线链接与次要标记（`chip.sec`）。
2. **严守不染色的边界**：主操作按钮（如播放按钮）保持唯一墨色实心 `--action-solid`；时间轴语段与侧栏列表对象的选中保持中性灰 `--selection` + 左墨条；焦点环保持石墨细环 `--focus-color`；说话人／层区分保持 `--series-ink-0..3` + 线型；成功／警告／失败三态保持各自语义色。

## 未选方案

- **继续只用一个 `--secondary` 色值**：无法同时满足「浅底可读深字」与「暗色实心块配白勾 ≥ 4.5:1」。
- **把主按钮和语段选中也改成主题色**：会破坏纸本墨色主调，且让长时间阅读的转写轨道被大面积紫色淹没。

## 影响

- `src/styles/tokens.css` 与 `scripts/build-od-design-tokens.mjs` 新增 `brand` / `brand-on` / `brand-tint`，更新亮色 `mark-secondary`。
- `DESIGN.md`、`SKILL.md`、组件母件预览页（`colors`、`components-shell`、`components-media`、`components-forms`、`components-desktop`、`components-tasks`、`components-data`、`components-ai`、`components-tags`、`preview.css`）及 Open Design 转写精稿同步切换至三档主题色。
