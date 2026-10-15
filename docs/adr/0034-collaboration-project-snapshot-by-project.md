---
title: '0034 — 协作项目快照按项目裁剪'
doc_type: adr
status: accepted
owner: collaboration
last_reviewed: 2026-10-14
source_of_truth: decision
---

# 0034 — 协作项目快照按项目裁剪

> ADR-0044 已取代「快照不含词库、语言资产和正字法」。快照带上该项目的这些行。下面保留的是：不整库覆盖，AI 与审计表仍不进快照。

## 背景

托管协作把 `collaborationProjectId` 等同于当前转写 `textId`。自动快照曾调用整库 `exportDatabaseAsJson()`，空库水合与面板 restore 曾 `importFromJSON(..., 'replace-all')`。`LexemeDocType` 没有 `textId`；`ProjectEntityType` 没有 `lexeme`。

## 决策

1. **协作项目快照**包含该 `textId` 的转写图，以及该项目的词条、说话人、正字法、语言记录等目录行（ADR-0044）。**不含** AI/MCP 表和审计表。恢复时先删该项目的旧目录行再写入，其它项目的行不动。
2. **Restore / 首台水合**对该项目行 prune 后 upsert，**禁止**整库 `table.clear()`。
3. 用户 **整库 JSON 备份**（ADR-0008）保持全库导出，与协作快照分轨。
4. 项目内目录行的归属和快照范围以 ADR-0044 为准。跨项目共用目录不在本 ADR 里恢复。

## 影响

- 第二台从项目快照得到的是该项目自己的目录行，不是别的项目的词库。
- Restore 不整库清空。导入完成后，只清掉目标词或语素已经不存在的链接。删除项目仍会删掉该项目词上的链接。
- 旧的整库云快照仍可导入：先按 `textId` 过滤，留下该项目的目录行，丢掉其它项目的行。

## 被放弃的备选方案

- **Fail-close 停传快照**：破坏空库首台加入。
- **快照含全部词条**：restore 会把 A 的词库打进 B 的本机全局表。
- **给词条加 projectId**：已由 ADR-0044 采用项目编号，不再是被放弃的方案。

## 后续回顾点

- 若 1B 多用户需要共享词库，用 `project_changes` `delete_entity` / upsert，而不是把 lexeme 塞回 15 分钟整表快照。
