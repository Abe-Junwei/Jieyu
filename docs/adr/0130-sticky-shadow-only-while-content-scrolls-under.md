---
title: ADR 0130 - 顶栏阴影只在内容滚过时出现
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-20
source_of_truth: decision-record
depends_on:
  - ./0104-type-space-shadow-and-ink-only-series.md
  - ./0129-playback-bar-casts-a-short-shadow.md
---

# ADR 0130：顶栏阴影只在内容滚过时出现

## 背景

[ADR-0104](./0104-type-space-shadow-and-ink-only-series.md) 规定工作面、面板、卡片和顶栏不加投影，工具栏只用 1px 分隔。[ADR-0129](./0129-playback-bar-casts-a-short-shadow.md) 给桌面转写页播放栏加了常驻的朝下短阴影。播放栏是主列里的一块，主列 `overflow: hidden`，波形和轨道是它下面的兄弟，没有内容从栏底滚过。常驻阴影因此只是装饰。

## 决定

1. **阴影是滚动抬升，不是常驻装饰。** 粘顶工具栏静止时只有 1px 底边分隔。只有它真正盖住的那个滚动容器 `scrollTop > 0` 时，才在底边加上轻量 `--shadow-sticky`。不把 `--shadow-popover` 套到顶栏上。亮暗都保留这条分隔线，暗色靠它看见边界。侧栏、波形、轨道和卡片仍不加投影。
2. **没有内容滚过，就不加阴影。** `.desktop-tx-bar` 下面没有这样的滚动容器，所以撤掉常驻阴影，只留 `1px` 的 `--divider-base`。`--shadow-chrome-below` 不再使用。`--shadow-sticky` 留到第一条真正会滚过的顶栏再定义。
3. **ADR-0104 与 ADR-0129 的正文不改。** 三档浮层阴影仍按 ADR-0104。ADR-0129 里「播放栏常驻短阴影」这一条改由本篇执行。

## 未选方案

- **播放栏继续常驻投影。** 栏下没有滚动内容，阴影不表示抬升。
- **现在就定义 `--shadow-sticky` 并监听一个不会滚动的容器。** 状态永远是关的，令牌没有使用处。
- **改写 ADR-0104 或 ADR-0129。** 已接受的决定不改写。

## 影响

- `design/jieyu-paper/DESIGN.md` 把「其余工具栏禁止投影」收成上述条件。
- `.desktop-tx-bar` 用底边分隔线，不再引用已删除的 `--shadow-chrome-below`。
