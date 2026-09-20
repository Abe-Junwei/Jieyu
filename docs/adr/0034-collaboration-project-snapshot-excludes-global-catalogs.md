---
title: '0034 — 协作项目快照不含全局目录'
doc_type: adr
status: active
owner: collaboration
last_reviewed: 2026-09-20
source_of_truth: decision
---

# 0034 — 协作项目快照不含全局目录

## 背景

托管协作把 `collaborationProjectId` 等同于当前转写 `textId`。自动快照曾调用整库 `exportDatabaseAsJson()`，空库水合与面板 restore 曾 `importFromJSON(..., 'replace-all')`。`LexemeDocType` 没有 `textId`；`ProjectEntityType` 没有 `lexeme`。

## 决策

1. **协作项目快照**只包含该 `textId` 的转写图（texts / media / layers / units / tokens / notes / track 等），**不含** `lexemes`、`token_lexeme_links`、`lexeme_assets*`、语言资产与 AI/MCP 表。
2. **Restore / 首台水合**对该项目行 prune 后 upsert，**禁止**整库 `table.clear()`。
3. 用户 **整库 JSON 备份**（ADR-0008）保持全库导出，与协作快照分轨。
4. 词条若将来要跨设备共享，另开切片（共享目录合并或加 `projectId`），不在本 ADR 范围内。

## 影响

- 第二台不会从项目快照得到词库；本机词条在 restore 后仍在。
- 旧的整库云快照仍可导入：先按 `textId` 过滤，丢弃词库与其它项目行。

## 被放弃的备选方案

- **Fail-close 停传快照**：破坏空库首台加入。
- **快照含全部词条**：restore 会把 A 的词库打进 B 的本机全局表。
- **给词条加 projectId**：产品面过大，非热修。

## 后续回顾点

- 若 1B 多用户需要共享词库，用 `project_changes` `delete_entity` / upsert，而不是把 lexeme 塞回 15 分钟整表快照。
