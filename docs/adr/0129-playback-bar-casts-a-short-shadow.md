---
title: ADR 0129 - 波形上方的播放栏朝下投短阴影
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-20
source_of_truth: decision-record
depends_on:
  - ./0104-type-space-shadow-and-ink-only-series.md
---

# ADR 0129：波形上方的播放栏朝下投短阴影

## 背景

[ADR-0104](./0104-type-space-shadow-and-ink-only-series.md) 规定工作面、面板、卡片和顶栏不加投影，工具栏只用 1px 分隔。桌面转写页波形上方的播放栏（`.desktop-tx-bar`）没有这条底边。用户指定它用 Chrome 工具栏那种朝内容落下的短阴影，侧栏不加。

## 决定

1. **只这一条栏。** `.desktop-tx-bar` 使用 `--shadow-chrome-below`：亮色是 `0 1px 0` 的 6% 墨线加 `0 2px 6px` 的 8% 墨影。暗色纸面近黑，同一比例看不见，暗色改为 24% 和 32%。不复用 `--shadow-popover`。左轨和上下文栏不加这层阴影。
2. **栏本身盖住波形顶边。** 播放栏 `z-index` 为 `calc(var(--z-header-float) + 1)`，比波形上的缩放坞高一步，阴影才落在波形上。栏内的速度和视图菜单仍在这一层里，低于抽屉和模态。
3. **ADR-0104 的其余条款不变。** 工作面、面板、卡片、粘顶表头、时间刻度和其他工具栏仍不加投影。

## 未选方案

- **侧栏同样加投影。** 用户随后取消。
- **把播放栏放进 `--z-popover`。** 会和贴边菜单抢同一层。
- **改写 ADR-0104。** 已接受的决定不改写；这一处例外记在本篇。

## 影响

- `design/jieyu-paper/DESIGN.md` 的阴影条款写明这一条例外。
- 令牌在 `src/styles/tokens.css`，用法在 `src/styles/pages/desktop-transcription-workspace.css`。
