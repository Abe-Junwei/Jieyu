---
title: M18 命名与「子图 utteranceId」边界
doc_type: architecture
status: current
owner: repo
last_reviewed: 2026-04-15
source_of_truth: architecture
---

# M18 — 命名与「子图 `utteranceId`」边界

M18「一锤定音」**移除的是**：

- Dexie **`utterances` 表**（第二持久化根）；
- **`utterance_tokens` / `utterance_morphemes` 文档上作为外键列名的 `utteranceId`**（迁移后仅存 **`unitId`**，指向 `layer_units.id` 的 utterance 型宿主）。

**不承诺、也不应把 ADR/计划写成**「全仓不再出现 `utteranceId` 一词」。以下命名 **刻意保留**，语义是 **宿主单元 id**（通常等于 utterance 型 `layer_units.id`），**不是**已删除的子图 FK 列：

| 位置 | 含义 |
|------|------|
| `UtteranceTextDocType.utteranceId` | 翻译行所挂的 **宿主 utterance 单元 id**（历史字段名） |
| `LayerSegmentDocType.utteranceId` | 段所从属的 **父 utterance 单元 id** |
| UI / hooks 中 `utterances: UtteranceDocType[]` 等 | **读模型投影**（由 `layer_units` 派生），非 Dexie `utterances` 表 |

编写 ADR、发布说明或 CI 禁止项时，应区分 **「子图表上的 `utteranceId` 列」** 与 **「宿主 id 的 API 字段名 / 变量名」**，避免过度解读。

## 门禁脚本（可核查）

- 禁止 **业务代码** 再引入 `db.utterances` / `dexie.utterances` / `collections.utterances`：`scripts/architecture-guard.config.mjs`（M18 规则，白名单见配置内注释）。
- 子图索引：禁止对 `utterance_tokens` / `utterance_morphemes` 使用 **`where('utteranceId'`** 等（迁移完成后仅 `unitId`）。

## 协作 / 协议版本

当前仓库内 **`src/collaboration/*` 运行时** 使用 **每条协作记录上的 `version` 字段**做乐观并发；**未发现**与 M18 绑定的独立「协作 wire protocol 最低版本」常量。若产品对多端同步有 **单独协议版本**，应在 **发版说明 + 协作 ADR** 中写明 bump，而非在本文件虚构版本号。

## 相关

- [ADR-006 — 语言学子图 unitId + utterances 表移除](../adr/adr-006-linguistic-subgraph-unitid-utterances-retirement.md)
- [M18 行动方案](../execution/plans/M18-语言学子图-unitId-统一行动方案-2026-04-15.md)
