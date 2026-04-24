---
title: ADR 0017 - 解语核心工作台架构蓝图采纳与适配
doc_type: adr
status: proposed
owner: repo
last_reviewed: 2026-04-22
source_of_truth: decision-record
---

# ADR 0017：解语核心工作台架构蓝图采纳与适配

## 背景

针对“数据层 - 计算层 - 视图层”重构蓝图，已按当前仓库代码事实完成可行性评估。
本 ADR 记录可直接采纳、需适配采纳、暂不采纳的范围，避免路线图与现有实现主干（Dexie + Supabase 协同协议 + Worker/WASM）冲突。

相关事实锚点（代码/文档）：

1. 协同主干为 Supabase 协议回放与变更队列：`src/collaboration/cloud/syncTypes.ts`、`src/collaboration/cloud/CollaborationSyncBridge.ts`。
2. 数据主干为 `layer_units` / `layer_unit_contents` 与 `unitId` 体系：`src/db/engine.ts`、`docs/architecture/timeline-unit-governance.md`。
3. 已有 Worker/WASM 基座：`src/ai/embeddings/EmbeddingRuntime.ts`、`src/ai/embeddings/transformersRuntimeConfig.ts`。
4. 虚拟列表默认方案为 `@tanstack/react-virtual`；`pretext` 在规划中为非默认：`package.json`、`docs/execution/plans/写作页开发路线图-2026-04-22.md`。

## 决策

### 1. Adopt / Adapt / Reject

| 项目 | 结论 | 说明 |
| --- | --- | --- |
| 三层解耦（数据/计算/视图） | **Adopt** | 与现有架构方向一致，作为后续重构总原则。 |
| 状态扁平化（关系型实体 + 关系表） | **Adopt** | 与现有 Dexie 表结构同向，继续强化单一真源。 |
| 主线程零重计算（Worker/WASM） | **Adopt** | 已有运行时基础，扩展成本可控。 |
| 防御性指针（悬空降级） | **Adapt** | 保留思路，但采用 Dexie-first 渐进迁移，不一次性改全表。 |
| 无监督分词（PMI/熵）建议层 | **Adapt** | 作为建议系统接入，不默认静默改库。 |
| Row-based IGT 渲染 | **Adapt** | 先用 TanStack Virtual 落地，必要时再做 pretext 时间盒对照。 |
| Leipzig 键盘 AST 流 | **Adapt** | 先落最小符号集与现有 hooks 状态机，不前置引 Zustand。 |
| Yjs 作为协同底座 | **Reject（当前阶段）** | 将与现有 Supabase 协同协议形成双主干，迁移风险过高。 |
| pretext 作为默认排版引擎 | **Reject（当前阶段）** | 与既有“非默认”决策冲突，先以 TanStack 方案为默认。 |

### 2. 迁移原则

1. 不新增第二协同真源：P0-P2 维持 Supabase 协同协议主干，不引入 Yjs 生产写链。
2. 不默认静默改写：自动分词、自动判词、自动 gloss 仅作为建议层，必须人工采纳。
3. 不一次性替换布局引擎：先达成 Row-based + 虚拟列表指标，再决定是否进入 pretext 对照实验。

## 迁移风险清单（按优先级）

1. **双主干风险（P0）**：Yjs 与 Supabase 并行写入导致一致性与回放顺序不可验证。
2. **删除语义风险（P0）**：现有硬删链路较多，若直接全量切软删，易引发引用泄漏与历史数据混态。
3. **性能误判风险（P1）**：未先建立 TanStack 基线即引入 pretext，可能增加复杂度但收益不确定。
4. **交互复杂度风险（P1）**：键盘 AST 一次性覆盖全部形态规则，容易引入编辑状态机回归。
5. **自动化误改风险（P1）**：若将高置信度建议直接写库，可能破坏已标注数据与审计链。

## 实施里程碑（与路线图一致）

1. **M1.5（数据安全）**：完善悬空降级与防御性指针策略，保持页面“可渲染、可诊断、不白屏”。
2. **M2（布局）**：Row-based 渲染 + `@tanstack/react-virtual` 默认落地，建立可回归性能基线。
3. **M3（交互）**：最小 Leipzig 键盘 AST（`.` / `-` / `=` / `\\`）与可回放用例。
4. **M4（本地外脑）**：Segmenter Worker（PMI/熵）上线建议层，支持离线、可取消、可回滚。

## 影响

1. 路线图执行口径统一为“Dexie/Supabase 主干 + 本地 Worker 增强 + 建议优先”。
2. 任何涉及 Yjs/pretext 默认化的提案，需提供时间盒对照数据并通过联评后再升级。

## 后续回顾点

1. 当标注页/语料库页从占位转为开放后，复核本 ADR 的 M2-M4 时间窗。
2. 若协同协议升级（`protocolVersion`）导致对象模型变化，需补充 superseding ADR。
