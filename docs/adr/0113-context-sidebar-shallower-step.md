---
title: ADR 0113 - 上下文栏灰阶改浅，分界靠边线
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0112-context-sidebar-deeper-than-paper.md
---

# ADR 0113：上下文栏灰阶改浅，分界靠边线

## 背景

[ADR-0112](./0112-context-sidebar-deeper-than-paper.md) 把亮色上下文栏定成灰阶第 5 档 `#E2E2E2`。整栏看起来像一块深灰板，比主工作区白纸跳得太多。VS Code Light Modern 的默认是侧栏 `#F8F8F8`、编辑区 `#FFFFFF`、分界线 `#E5E5E5`，选中行 `#E8E8E8`。深浅差在线上和选中行，不在大面积底色。

## 决定

1. **亮色 `--chrome-context-bg` 改为灰阶第 3 档 `#F5F5F5`。** 这是现有色阶里最接近 `#F8F8F8`、又比书桌 `#FAFAFA` 深一档的值。不新增色值。
2. **暗色改为 `#121210`。** 只比纸页 `#161614` 深一档，不再用书桌 `#0C0C09`。
3. **上下文栏与主工作区的分界用 `--border`（亮色 `#E2E2E2`）。** 导航轨仍与纸面同色。
4. **栏内选中行回到 `--selection`。** 它比 `#F5F5F5` 更深，左侧墨条保留。输入框仍是纸色。

## 未选方案

- **维持 `#E2E2E2`：** 比 Light Modern 的侧栏深了约一整档，大面积发闷。
- **直接写成 `#F8F8F8`：** 和书桌 `#FAFAFA` 只差两个色阶，还要在 12 档灰之外再加一档。

## 影响

- 替换 ADR-0112 里的两个色值。上下文栏这个角色还在。
- `DESIGN.md`、生成的 `tokens.css`、壳层预览和转写精稿一起改。
