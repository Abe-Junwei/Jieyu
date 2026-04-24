---
title: ADR 0016 - 写作工作台协同对象映射（占位）
doc_type: adr
status: proposed
owner: repo
last_reviewed: 2026-04-21
source_of_truth: decision-record
---

# ADR 0016：写作工作台 · Supabase 协同对象映射

## 背景

[ADR 0012](./0012-writing-workspace-dexie-schema.md) 决策 4–6 已冻结：**`project_changes` / `project_snapshots` / `project_presence` 为共享协同真源**、写作 **Dexie 为本地快照与检索**、**G4.0 章级/文档级** 回放与冲突边界。现仓转写侧已存在 **`evaluateCollaborationProtocolGuard`**（`src/collaboration/cloud/collaborationProtocolGuard.ts`）与 `useTranscriptionCollaborationBridge` 等 **出站/禁写** 语义（见 `docs/architecture/collaboration-cloud.md`）。

**缺口**：尚未规定 **写作项目** 的 CM6 编辑事务如何 **序列化为 `project_changes` 载荷**、与 **转写** 在同一协议表下 **如何区分**、**章级快照触发与冲突合并** 与现有守卫的 **对齐方式**——G4.0 实装前若无本 ADR，易出现 **各写各的 mutation 形状**、与协同云基础门禁 **不对照**。

规划锚点：[写作页路线图 · 第三节 · 协同层](../execution/plans/写作页开发路线图-2026-04-22.md)、[第五节 · G4](../execution/plans/写作页开发路线图-2026-04-22.md)、[2.6.3 · 章级冲突产品态](../execution/plans/写作页开发路线图-2026-04-22.md#26-补充工程与交付策略与合同包并列)。

## 决策（骨架 · 待 G4.0 深潜前补全）

1. **本 ADR 为 G4.0 前置规格**：在 **G4.0 开发深潜** 前，须将下列 **Open questions** 收敛为 **可 JSON Schema / Zod 化的载荷草案** + **至少一条端到端回放用例**（可与现有协同 fixture 策略对齐）。
2. **与 0012 关系**：Dexie ⟷ 云端分工、**禁止双写脑裂**、**manifest 经 `ManifestSchema.parse`** 等 **仍以 0012 为准**；本 ADR **只增**「写作对象 ↔ 协议表」的 **映射与守卫边界**，不替代 0012。
3. **与协议守卫关系**：写作出站是否沿用 **`projects.protocol_version` / `projects.app_min_version` + `evaluateCollaborationProtocolGuard`** 的 **同一语义**，或需 **扩展字段/版本线**，须在本 ADR **显式二选一** 并附 **禁写/只读** UX 说明（Open question 3）。

## Open questions（G4.0 必答）

1. **`project_changes` 载荷**：CM6 **一次可提交编辑**（或 debounced 合并后）如何映射为 **单条或多条** `project_changes`？**最小字段集**（如 `surface`、`docId`/`chapterId`、`op`、`payload`、`vector_clock` 等）与 **转写现有载荷** 是否 **同 schema 扩展** 还是 **并列 discriminant**？
2. **与转写共表区分**：写作与转写 **共用** `project_id` + 协议表时，靠 **`surface: "writing" | "transcription"`**（或等价字段）、**独立 `project` 行 + 同构协议** 等 **哪一种** 为默认？对 **RLS、审计、现有 dashboard** 的影响须在正文列出。
3. **`evaluateCollaborationProtocolGuard`**：写作桥接 **是否** 在每次出站前调用同一守卫；若写作 **app 版本矩阵** 与转写 **不一致**，如何 **降级为只读** 而不破坏「占位页 / lab」双分支（链 [路线图 1.3](../execution/plans/写作页开发路线图-2026-04-22.md)）。
4. **`project_snapshots` 章级策略**：**触发时机**（定时 / 失焦 / 显式保存 / 协同回合边界）、**快照粒度**（整章 md、manifest 片段、二者兼有）、与 **[路线图 2.6.3](../execution/plans/写作页开发路线图-2026-04-22.md#26-补充工程与交付策略与合同包并列)** 冲突产品态的 **一一对应表**。
5. **`project_presence` 元数据**：与 [路线图 2.8.7](../execution/plans/写作页开发路线图-2026-04-22.md#28-可访问性事故手册大文档边界与横向收口) 协同隐私条款 **对齐的最小字段集**（显示名、光标章/段是否暴露等）。

## 影响

- G4.0 实现 PR **须** 引用本 ADR 冻结后的 **载荷 schema** 与 **回放用例**；与 `scripts/check-collaboration-cloud-foundation.mjs` 等门禁 **对齐或显式登记例外**。
- 0012 后续回顾点「G4.0 与 G4.1 边界」与本 ADR **同步更新**。

## 后续回顾点

1. Open questions 1–2 有 **Zod/JSON Schema 草案** 后，将本 ADR 链入路线图 [第六节 · 6.2](../execution/plans/写作页开发路线图-2026-04-22.md#62-计划-adr须落入-docsadr编号择机) 并在 0012 正文 **交叉引用**。
2. 首次 G4.0 合入主分支前，`status` 推进策略由团队定（通常需 **载荷 + 守卫 + 一条回放** 齐备后才 `accepted`）。
