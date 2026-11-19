---
title: ADR 0125 - 全稿概览是时间尺底部的视窗条
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-19
source_of_truth: decision-record
depends_on:
  - ./0115-timeline-waveform-and-segment-highlights.md
---

# ADR 0125：全稿概览是时间尺底部的视窗条

## 背景

[ADR-0115](./0115-timeline-waveform-and-segment-highlights.md) 第 2 条把全稿概览写成迷你波形上的视窗框：`1.5px solid var(--secondary)`，再铺一层极淡主题色，拖这个框来平移。

时间尺里已经有概览。它在 `TimeRuler` 底部，高 4px：1px 轨道加上 3px 圆角视窗。点或拖这条，播放头跳到对应时刻，不改主波形正在看的范围。

## 决定

1. **替换 ADR-0115 第 2 条。** 全稿概览就是这条视窗条，不再另做迷你波形，也不再画 `--secondary` 视窗框。
2. **轨道**高 1px，颜色 `color-mix(in srgb, var(--header-accent) 22%, var(--border-soft) 78%)`。**视窗**高 3px、全圆角，颜色 `color-mix(in srgb, var(--header-accent) 86%, var(--state-info-solid) 14%)`，外圈 `0 0 0 1px`、`--header-accent` 的 18%。
3. 点或拖概览调用已有的 `seekTo`。视窗的左右位置仍表示主波形正在看的那段。
4. 波形选区、波峰和当前语段仍按 ADR-0115 第 1 条与 [ADR-0117](./0117-active-segment-uses-input-focus-chrome.md)。

## 未选方案

- **保留迷你波形，只把视窗框改成这条的颜色。** 那仍然是第二套概览。
- **拖视窗来平移主波形。** 现有时间尺不是这个动作。

## 影响

- `design/jieyu-paper/DESIGN.md` 里全稿概览的那一句改成与本篇一致。
- Pixso「精稿」页去掉独立的概览波形带；时间尺底部的视窗条按本篇着色。
