---
title: ADR 0012 - 写作工作台 Dexie 表与迁移
doc_type: adr
status: proposed
owner: repo
last_reviewed: 2026-04-23
source_of_truth: decision-record
---

# ADR 0012：写作工作台 Dexie 表与迁移

## 背景

写作 G1 需要持久化文稿与元数据，与现有 `bibliographic_sources`、`abbreviations` 等表并存；须避免表名冲突与无版本迁移。规划见 [写作页开发路线图 · 第五节 · G1](../execution/plans/写作页开发路线图-2026-04-22.md)。

## 决策（骨架）

1. **表名前缀**：写作专用表统一使用 `writing_`（已冻结）；首批表名清单须在 G1 切片 A 开工前写入本 ADR 正文。
2. **schemaVersion**：与现有 Dexie 迁移链一致， bump 规则与回滚策略单独列出。
3. **Zod**：持久化载荷与 UI 态分离字段在 schema 中显式标注。
4. **Dexie ⟷ Supabase 协同协议（v2 协同，防「脑裂」）**（与 [路线图 · 第五节 G4](../execution/plans/写作页开发路线图-2026-04-22.md) 对齐）：
   - **Supabase 协同对象状态**（`project_changes` / `project_snapshots` / `project_presence`）为 **共享协同真源**；编辑器 mount 时先恢复 Dexie 本地快照，再按协议回放远端增量。
   - **Dexie** 持久化 **Markdown 纯文本快照**、front matter、`writing_*` 元数据、以及 **用于全文检索 / 首屏快速打开** 的派生列；**不以 Dexie 本地快照覆盖云端已确认版本**，除非显式「冲突解决 / 导入合并」流程（须单测）。
   - **禁止**在业务层同时「无协议地」双写长文本到 Dexie 与云端对象导致分歧；合并与回滚策略在本 ADR 正文展开。
5. **书级 `writing-project`（章节顺序 / 合并入口等）**：**协同真源**为 **Supabase 协同对象快照中的结构化字段**，**不得**将「整份 `writing-project.yaml` 文本」当作多人并发直接编辑面。**导出或落盘**时再 **序列化** 为人类可读 YAML；与路线图 [第四节 · 书级](../execution/plans/写作页开发路线图-2026-04-22.md) 一致。**防腐（强制）**：从协同对象投影为普通对象后，须 **`ManifestSchema.parse(data)`**（Zod，名称以代码为准）**再** `yaml.stringify(parsed)`；**解析失败则禁止写盘**，并返回可诊断错误（避免协同脏数据落成 **语法损坏的 YAML**）。

## 影响

- 绿场/迁移脚本与 architecture guard 须在表落地时更新引用。
- 引入写作协同后，Dexie 本地快照与 Supabase 云对象的迁移顺序须与现有版本链 **统一规划**（避免回放顺序漂移无文档）。

## 后续回顾点

1. 首版迁移合并后 `accepted` 并锁定表清单。
2. 若与 Grammar 或转写库发生 FK 级联，在 ADR 0011/Grammar 边界文档中交叉引用。
