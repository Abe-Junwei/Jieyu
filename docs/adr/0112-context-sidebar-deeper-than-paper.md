---
title: ADR 0112 - 上下文栏深于主工作区纸面
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0103-paper-field-notes-is-the-only-appearance.md
  - ./0104-type-space-shadow-and-ink-only-series.md
---

# ADR 0112：上下文栏深于主工作区纸面

## 背景

纸本田野笔记的亮色表面只有白纸 `#FFFFFF`、书桌 `#FAFAFA`、浅灰底 `#F5F5F5`。这三档并排时几乎看不出栏和工作区的差别。Cursor、VS Code、Linear 的做法是壳层用一档明显更深的中性灰，颜色留给内容，而不是再加一种色相。导航轨仍要与纸面同色，不能把整条左缘涂灰。

## 决定

1. **新增 `--chrome-context-bg`，Open Design 名为 `--context`。** 只给可折叠的上下文栏及其收起后的重开条。不用于导航轨、主工作区、波形或语段。
2. **亮色取现有灰阶第 5 档 `#E2E2E2`。** 不新造第 13 档灰。第 2–3 档保留给书桌和浅灰底，不拿来做侧栏。
3. **暗色与书桌同为 `#0C0C09`，深于纸页 `#161614`。**
4. **栏内选中行回到纸色，并保留左侧墨条。** 输入框保持纸色。时间轴选中底 `--selection` 不改。

## 未选方案

- **继续用 `#F5F5F5`：** 与白纸的差别在整栏上仍然看不出来。
- **给侧栏一种低饱和彩色：** 和 ADR-0104 拒绝的分类色是同一类问题。
- **把导航轨一起加深：** ADR-0103 规定导航轨与纸面同色。

## 影响

- `src/styles/tokens.css`、生成的 `design/jieyu-paper/tokens.css` 和 `DESIGN.md` 增加这一档。
- 壳层预览和转写精稿的上下文栏改用 `--context`。
