---
title: F4-扩展入口-capability-isolation-epic-2026-05-01
doc_type: execution-plan
status: active
owner: repo
last_reviewed: 2026-05-12
---
---

## title: F4 扩展入口 Capability Isolation 史诗（2026-05-01）
doc_type: execution-plan
status: active
owner: ai-runtime
last_reviewed: 2026-05-07
source_of_truth: execution
depends_on:
  - ./AI智能体-战略规划与下一步-2026-05-07.md

> **AI 智能体总体规划**（已完成里程碑 + 下一步路径）：《[AI智能体-战略规划与下一步-2026-05-07.md](./AI智能体-战略规划与下一步-2026-05-07.md)》

# 1. 背景与目标

当前 F4 已完成最小收口：

- 后台记忆抽取路径已接入 sandbox 决策（allow/ask/deny）。
- C5 release evidence 已聚合 sandbox 决策分布并接入 unified governance gate。

本史诗聚焦 **F4 扩展入口**：将更多后台工具入口纳入 capability isolation，避免出现“主链受控、旁路未受控”的治理缺口。

## 成功标准

1. 新接入的后台入口在运行时统一走 sandbox 决策函数。
2. 审计 metadata 可追溯决策 action/reason。
3. release evidence 或对应 gate 能观察新增入口的决策分布。
4. 对现有入口无行为回退（关键用例回归通过）。

# 2. 范围定义

## In Scope

- 新增后台工具入口的 sandbox 接线（按优先级分批）。
- 审计字段对齐：保持 action/reason 结构一致。
- 证据面扩展：新增入口至少具备结构化统计与 gate 可见性。
- 最小回归测试与门禁脚本覆盖。

## Out of Scope

- 重构全部 tool runtime 架构。
- 与 F2b/F3 无直接关系的 UI 大改。
- 非后台路径的策略重写。

# 3. 优先级批次

## Batch A（P0）

1. 枚举现存后台入口并标注是否已受控。
2. 接入优先级最高的 1-2 个未受控入口。
3. 补齐审计与单测。

## Batch B（P1）

1. 将高风险写操作入口全部纳入 sandbox。
2. 将决策分布接入 release evidence 卡片或索引摘要。
3. 增补 strict 场景回归。

## Batch C（P2）

1. 覆盖低风险/只读入口的一致性治理。
2. 补性能与可观测性基线文档。

# 4. 实施清单（可直接开工）

**2026-05-05 状态对齐（Batch A 收口）**：两条旁路（**置顶用户 directive**、**send-preflight 用户指令**）已统一走 `resolveAiChatSessionSidecarSandboxPolicy`；当 sandbox 决策 **非 `allow`** 时，写入 `audit_logs.field = ai_session_sidecar_sandbox`（`metadataJson` 含 `phase`、`gate`、`sandboxAction`、`sandboxReason`；实现 `src/hooks/useAiChat.sessionSidecarAudit.ts`；接线点 `useAiChat.directiveSessionControls`、`runAiChatSendTurnPreflight`）。受控矩阵：[F4-扩展入口-受控矩阵-2026-05-05.md](./F4-扩展入口-受控矩阵-2026-05-05.md)；收口摘要见《[AI智能体-战略规划与下一步-2026-05-07.md](./AI智能体-战略规划与下一步-2026-05-07.md)》§2.2（OKR 原文已归档）。

1. **盘点入口清单**：受控矩阵持续维护（含 Batch B 抽样结论）— 见上矩阵链接。
2. **统一接线模板**：矩阵 §2（决策 / 审计 / 测试 / 证据）— 已作为后续入口默认模板。
3. **接入 Batch A（两条）**：~~置顶 + send-preflight~~ **已完成**；审计字段 `**ai_session_sidecar_sandbox`** 已登记于 `generate-release-evidence-bundle.mjs` 的 `auditFieldDictionary`。
4. **回归与门禁**：定向 Vitest 见矩阵 §4；`npm run check:ai-session-sidecar-entrypoints`；`npm run gate:release-evidence:governance`；`npm run check:agent-evals:trace`。
5. **Batch C 可观测基线（session sidecar）**：新增 `npm run gate:release-evidence:session-sidecar-sandbox`，输出并校验 `ai_session_sidecar_sandbox` 的 action/reason/gate 分布与 deny/ask rate 阈值（历史窗口动态阈值，样本不足回退固定上限）。
6. **文档与验收**：本史诗 §4/§5；产品侧 Dexie 抽查步骤见 [手工验收执行脚本-F4-session-sidecar-sandbox-audit-2026-05-05.md](../archive/manual-validation/手工验收执行脚本-F4-session-sidecar-sandbox-audit-2026-05-05.md)；自动化壳烟测 `tests/e2e/aiChatSendTurnSmoke.spec.ts`。

# 5. 验收与退出条件

1. 至少 2 个新增入口完成 capability isolation。**（2026-05-05：Batch A 两条已满足。）**
2. 新增入口在审计中可看到 sandbox **action / reason**（字段 `**ai_session_sidecar_sandbox`** 的 `metadataJson.sandboxAction` / `sandboxReason`，以及 `gate` 虚拟路径）。**（已满足。）**
3. release evidence 报告可见新增入口统计或明确 skip 原因（`auditFieldDictionary` 已含新字段；dry-run gate 无结构回归）。**（已满足。）**
4. `gate:release-evidence:governance` 与 `check:agent-evals:trace` 及定向 Vitest 通过。**（已满足。）**

# 6. 风险与缓解

1. 风险：不同入口参数结构不一致，导致统一决策函数接线碎片化。

- 缓解：先落接线模板并定义最小输入契约。

1. 风险：无审计源时 gate 误报失败。

- 缓解：保持结构校验与 skipped 兼容策略并在 runbook 明确。

1. 风险：入口扩展触发 architecture-guard 历史告警。

- 缓解：每批次先做 changed-only 预检，再跑全量门禁。