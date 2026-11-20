---
title: ADR 0128 - 时间码草稿进项目库，边界编辑按稿件撤销
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-19
source_of_truth: decision-record
depends_on:
  - ./0086-desktop-release-scope-and-format-freeze.md
  - ./0100-desktop-engineering-contract.md
  - ./0121-text-save-receipt-and-draft.md
  - ./0122-integer-milliseconds-and-optional-media.md
---

# ADR 0128：时间码草稿进项目库，边界编辑按稿件撤销

## 背景

转写切片 1b-2 要改句段边界，并让没写完的时间码关掉再开还在。ADR-0100 E02 规定没写完的输入是草稿，正式的 `start_ms`／`end_ms` 停在上一次合法值。ADR-0122 把开发库定在 `user_version` 29，库内最短 1 毫秒，界面拖动和拆分用 10 毫秒。撤销当时是会话里的一步，不按稿件分开，也没有重做。

## 决定

1. **开发格式改为 `user_version` 30。** 新增 `unit_time_drafts`：语段、哪一条边（`start`／`end`）、未生效原文、它所基于的毫秒、校验说明、更新时间。正式时间不存半截输入。不写迁移器。不是 30 的库仍拒绝且不改字节。
2. **界面提交的单边移动和共用边界用 10 毫秒下限。** 库触发器仍只要求至少 1 毫秒。同一层说话人相同，或两边都没有说话人，区间重叠则拒绝，不推动相邻段。没挂录音就不做媒体范围检查。两条边已经相接时，共用边界同一步改两边；没相接就拒绝。
3. **撤销和重做按稿件分栈，只活在当前会话。** 正文、拆分、合并、指派、边界、新建、删除共用这一对栈。关掉或重新打开项目，栈清空。后一次编辑改过相关对象时，不撤销更早的那一步。删除后撤销，语段和它的下级用原来的 id 插回去。

## 未选方案

- **半截时间码写进 `start_ms`／`end_ms`**：正式时间会变成非法或半成品，重开后分不清哪一次是生效的。
- **继续用全局一步撤销**：改完边界再改正文，前一步直接丢掉，也不能重做。
- **为 29 的库补这张表**：冻结规则是拒绝而不是改写。

## 影响

- DDL 在 `src/db/desktop/schema.ts`，冻结记录在 `src/db/desktop/formatFreeze.record.json`。
- 删语段、清文稿时同一事务删掉 `unit_time_drafts` 上的行。
- 拖动预览、吸附和键盘微调不写库，松手或提交时才走这条写入。
