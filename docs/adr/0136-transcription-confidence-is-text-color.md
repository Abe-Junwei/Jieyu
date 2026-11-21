---
title: ADR 0136 - 机器转写置信度用正文颜色
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-21
source_of_truth: decision-record
depends_on:
  - ./0104-type-space-shadow-and-ink-only-series.md
  - ./0115-timeline-waveform-and-segment-highlights.md
---

# ADR 0136：机器转写置信度用正文颜色

## 背景

[ADR-0104](./0104-type-space-shadow-and-ink-only-series.md) 第 5 条把机器转写置信度画成下划线：中是墨色虚线，低是琥珀实线，高不画。[ADR-0115](./0115-timeline-waveform-and-segment-highlights.md) 规定时间轴上的红色只表示保存失败。设计稿改为用正文颜色区分三档，不再加下划线。

## 决定

1. **有存储值才着色。** `units.confidence` 是 0–1 的数时，语段正文按档着色：不低于 0.75 用 `--state-success-text`，不低于 0.5 且低于 0.75 用 `--state-warning-text`（琥珀），低于 0.5 用 `--state-danger-text`。`NULL` 或非数保持墨色。改正文不清除这个值。
2. **只给正文上色。** 说话人标记、自标确定度徽标、保存失败和选中底色不跟着置信度变。不加下划线。
3. **ADR-0104 第 5 条的置信度句子和 ADR-0115「红色只表示保存失败」不再约束语段正文。** 说话人轨、层联动线仍只用墨色。保存失败仍用它自己的状态，不改成这段红字。

## 未选方案

- **沿用两档下划线。** 设计稿已改成三档正文颜色。
- **改写 ADR-0104 或 ADR-0115。** 已接受的决定不改写。

## 影响

- 档位在 `src/utils/segmentConfidence.ts`，颜色在 `timeline-annotation.css`。
- 模型回包的语段 `confidence` 经预览记在内存里，接受时写入 `units.confidence`。没有或超出 0–1 的值不写入。
