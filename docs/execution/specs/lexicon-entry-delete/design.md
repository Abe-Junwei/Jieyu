---
title: lexicon-entry-delete design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-19
source_of_truth: lexicon-entry-delete-spec
depends_on:
  - ./requirements.md
  - ../lexicon-entry-edit/design.md
---

# Design — Lexicon Entry Delete (B3d)

## 1. 成熟方案扫描 / Research

- 仓库既有：B3b `saveLexiconEntry` write→list readback；B2 `dispatchWorkspaceLexemeDeleted`（尚无生产者）；B8 `unlinkLexemeAttachment` refCount GC；`ConfirmDeleteDialog`；`removeUnitCascade` 删关联表。
- 同类产品：FLEx `LexEntry.Delete()` 删除词条及其 owned senses/allomorphs；引用集合不留悬空。WeSay/FLEx 删除需确认。
- 业内：LIFT `dateDeleted` 只服务导入侧同步；普通 LIFT import **不能**靠省略条目删除库内数据。本地 Dexie 不需要 `dateDeleted` 列。
- 公认不可行：软删第二真源；为删除升 Dexie 版本；把级联写进 `LexiconPage`；用 LIFT 导入当删除通道。
- 潜在的坑：只删 lexeme 行会留下 `token_lexeme_links` / 附件；未确认就删；`list()` 不 readback 会误报成功。
- 决定：**复用** B2 事件、B8 unlink GC、`ConfirmDeleteDialog`；**适配** FLEx 硬删除 owned 子对象；**自研** 仅 `deleteLexeme` 事务 + 表单确认。不新增依赖。

## 2. 架构选择

- 落位：`actions`（delete 事务）+ `state`（确认框）
- 选 A：`deleteLexeme` 在 lexeme ops + 页面 helper readback + 现有 edit controller 增确认
- 拒绝：软删列；新 mega-controller；页面直写 Dexie

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `linguisticServiceLexemeOps.ts` | 事务删 lexeme / links / 附件 | 增量 |
| `deleteLexiconEntry.ts` | list readback | 小 |
| `useLexiconEntryEditController.ts` | 确认开关 + 删除 | < 200 / ≤ 8 |

约束自查：无 ChatWindow；无 `src/features/`；删除按钮无第三层 border。

## 4. ADR 引用

- 无新 ADR。删除语义沿用 B2 `deletionMode: 'hard'`。

## 5. Feature flag

- 无新 flag。

## 6. 失败模式 / 兼容性

- 词条不存在：`NOT_FOUND`，不派发事件。
- 回滚：revert PR。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 持久化 | Dexie vitest delete readback + cascade | pass |
| 守卫 | architecture-guard / docs / r1-r8 | OK |
