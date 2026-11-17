---
title: ADR 0105 - 遮罩、暗色状态色点与系列墨色第 4 档
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0104-type-space-shadow-and-ink-only-series.md
---

# ADR 0105：遮罩、暗色状态色点与系列墨色第 4 档

## 背景

[ADR-0104](./0104-type-space-shadow-and-ink-only-series.md) 之后核对 Open Design 设计体系包，发现三处值没有 token 或在暗色下不成立：

- 模态遮罩没有 token。`DESIGN.md` 写亮色 #20242C / 24%、暗色黑 / 48%，而 `dialog-shell.css` 实际用 `color-mix(--shadow-color 44%)`。
- 暗色只覆盖了 `--state-success-text` 和 `--state-warning-text`，色点沿用亮色 `#16a34a` / `#d97706`。在暗色纸页 #161614 上对比度 5.5:1 / 5.7:1，够用但是碰巧，和 `--state-danger-solid` 暗色单独变体的口径不一致。
- 系列墨色第 4 档跟 `--gray-7`。暗色 gray-7 是 #5c5952，在纸页上 2.6:1，2px 线条和 12px 字母标记都看不清。

## 决定

1. **遮罩用一个 token**：`--scrim: color-mix(in srgb, var(--shadow-color) 44%, transparent)`，亮暗共用。`--shadow-color` 暗色是黑、亮色近黑，44% 在两套里都压得住纸面，也和现有遮罩实现一致。
2. **暗色状态色点跟文字走**：`--state-success-solid` 暗色改为 #4ade80，`--state-warning-solid` 暗色改为 #fbbf24，与各自的 `-text` 相同。浅底（`-bg`）和边框改用 `var(--state-*-solid)` 混色，不再写死亮色值。
3. **系列墨色第 4 档脱离 gray-7**：暗色 `--series-ink-3` 定为 #8a847a，在纸页 #161614 上 4.9:1，字母标记达到 4.5:1。亮色维持 #8a8a8a（3.45:1，2px 线条够、12px 字母标记不够，已知上限）。

## 未选方案

- **遮罩按 DESIGN.md 的 24% / 48% 两档**：会让新 token 和已经上线的遮罩亮度不一致，迁移时每个模态都要重看。
- **暗色色点维持亮色值**：对比度刚好过线，但三个状态色的口径不统一，后续调暗色底时没有余量。
- **第 4 档用 #8a8a8a**：对比度 5.25:1 更高，但变成纯灰，和前三档的暖墨色不一致。

## 影响

- 暗色里成功和警告的色点、以及用 `-solid` 混出来的浅底，都会比以前更亮。
- 说话人轨 D/H 在暗色下从看不清变为可读。
- 组件里手写的遮罩颜色仍按 ADR-0104 第 7 条分批迁移，这次只补 token。
