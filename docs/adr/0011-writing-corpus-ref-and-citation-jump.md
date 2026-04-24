---
title: ADR 0011 - 写作语料引用 corpusRef 与 citationJump 边界
doc_type: adr
status: proposed
owner: repo
last_reviewed: 2026-04-21
source_of_truth: decision-record
---

# ADR 0011：`jieyu:corpus:v1` / `corpusRef` 与 `citationJump` 共生边界

## 背景

写作块 `corpus-example` 要求 **`corpusRef` 必填**；解析须与转写侧 **同一语义内核**，避免两套 ID 语义。规划见 [写作页开发路线图 · 第四节](../execution/plans/写作页开发路线图-2026-04-22.md)。

**重要**：`src/pages/TranscriptionPage.citationJump.ts` 当前为 **页面级编排**（依赖 UI 回调、转写侧栏状态等），与 [独立工作台开放门槛 · 第四节](../execution/plans/独立工作台开放门槛与复用边界-2026-03-30.md)「禁止以复制页面级实现为起点」**一致地不可**被写作工作台直接 `import` 当作内核。须先抽出 **Citation Resolver Core**（纯解析 + 数据面、无转写 UI 耦合），写作与转写再共同依赖该核心。

## 决策（骨架）

1. **G0–G1 前置：Citation Resolver Core**：从现有 `citationJumpUtils`、DB 读取与 ref 归一逻辑中抽出 **可单测**模块；`TranscriptionPage.citationJump.ts` 改为薄封装调用核心（或并行迁移策略见实现 PR）。**未完成前**，G1 不得承诺「写作侧已可稳定 resolve `corpusRef`」。
2. **URI 文法**：`jieyu:corpus:v1:` 前缀 + 载荷结构在实现前以 Zod schema 与单测冻结。
3. **写作消费面**：写作、`writingDocAdapter`、导出 filter **仅**依赖 Resolver Core 的公开 API，不依赖转写页面 props。
4. **跨项目**：只读 resolve；未挂载项目须可诊断（断裂态 UX）。
5. **迁移**：无 `corpusRef` 的历史数据一次性迁移规则单独成表或附于本 ADR。
6. **语料删除与悬空引用**：转写侧对语料/项目的 **删除、归档、软删** 须能通过 Resolver **稳定落到** `CorpusRefBrokenError` / **断裂态 UI**（与 [路线图 2.7.1](../execution/plans/写作页开发路线图-2026-04-22.md#27-体验安全迁移与生态补充) 错误码同轨）；**禁止**写作块在 **无提示** 下长期显示已删语料的 **假成功** 摘录。具体 **软删字段、保留期、跨表级联** 在 Core 实现 PR 与本节 **同 PR** 补表。

## 语料生命周期与悬空引用（默认策略）

**目的**：在 **Dexie + 跨项目只读 `corpusRef`** 下，避免转写页 **删改语料** 后写作侧出现 **静默悬空指针**。

1. **解析结果须三分**：**OK** / **断裂可诊断** / **权限不足**；断裂须含 **稳定错误码** 与 **用户可行动文案**（重新挂载项目、语料已删除等）。
2. **删除语义（默认）**：语料权威行 **删除** 或 **软删（`deleted_at` 等）** 后，Resolver **不得**再返回「仿佛仍可读」的全文快照；写作 UI **须** 展示断裂态并可 **一键解除块或替换 `corpusRef`**（实现细节 PR 定稿）。
3. **导出**：导出管线对 **断裂块** 须有 **明确策略**（跳过、占位框、失败并诊断），**禁止**混入 **陈旧缓存文本** 冒充已解析语料。
4. **与 [ADR 0012](./0012-writing-workspace-dexie-schema.md)**：若写作本地缓存曾 **快照语料片段**，须在 **版本或 tombstone** 上与云端/Dexie 规则对齐，避免 **幽灵数据**；正文展开在 0012 修订或本 ADR 子表。

## Citation Resolver Core · 公开 API（草案）

**目的**：G1 实现者与导出 filter **不必从代码逆推** import 面；与 [写作路线图 2.8.6 · adapter semver](../execution/plans/写作页开发路线图-2026-04-22.md#28-可访问性事故手册大文档边界与横向收口) 同轨：**下列符号名为草案**，落地路径以 **G0 Core 抽取 PR** 定稿为准；破坏性变更须 **semver + migration note**。

**模块边界（占位路径）**：`src/writing/citation-resolver/`（或 `packages/citation-resolver-core/`，**二选一**在 Core PR 写明）。

| 草案符号 | 职责 | 输入 / 输出（草案） |
|----------|------|---------------------|
| `CORPUS_REF_PREFIX` / `CorpusRefSchema` | URI 文法与 Zod 正本 | `string` → parse 结果 |
| `parseCorpusRef(uri: string)` | 校验 `jieyu:corpus:v1:` 载荷 | 成功返回结构化对象；失败抛 **`CorpusRefSyntaxError`**（或 `Result` 联合类型，实现 PR 二选一并冻结） |
| `normalizeCorpusRef(...)` | 等价形式归一（若需要） | 供 Dexie / 导出索引 |
| `resolveCorpusSnippet(ref, ctx)` | **只读**解析到可展示片段（**无**转写侧栏 UI 依赖） | `ctx` 含 **DB 访问 / project 作用域** 等纯数据依赖；失败为 **`CorpusRefNotFoundError` / `CorpusRefBrokenError`** 等等待枚举 |
| `CorpusRefError`（基类或联合） | 与 [路线图 2.7.1](../execution/plans/写作页开发路线图-2026-04-22.md#27-体验安全迁移与生态补充) **稳定错误码** 可映射 | 诊断包字段 **一一对应** |

**禁止**：写作页、`writingDocAdapter`、导出层 **`import`** `TranscriptionPage.citationJump.ts` 或等效页面模块；**仅**依赖上述 **公开索引文件**（如 `src/writing/citation-resolver/index.ts` 显式 `export` 列表）。

## 影响

- `useAiChat` / `writingDocAdapter` / 导出 filter 仅消费冻结后的 `corpusRef` 模型与 Resolver Core API。

## 后续回顾点

1. Resolver Core 合入且转写 `citationJump` 已改调用后，将本 ADR 向 `accepted` 推进；`insert_corpus_example` 全链路可作为同一里程碑或紧随其后。
2. 若转写侧 ID 模型变更，评估 superseding ADR。
3. 语料删除/软删规则首版合入后，将 **「断裂态 / 错误码 / 导出占位」** 与单测清单链回本 ADR **§语料生命周期**。
