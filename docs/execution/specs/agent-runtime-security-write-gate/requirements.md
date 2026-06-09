---
title: agent-runtime-security-write-gate requirements
doc_type: execution-spec-requirements
status: draft
owner: ai-governance
last_reviewed: 2026-06-09
source_of_truth: agent-runtime-security-write-gate-spec
---

# Requirements — Agent Runtime Security Write Gate (A7)

> 关联切片：主路线图 **A7** · 架构 [ai-agent-runtime-security-local-first](../../../architecture/ai-agent-runtime-security-local-first.md) · 审查对账 [智能体改进方案 §10](../../plans/智能体改进方案-Anthropic启发-2026-06-09.md#10-审查对账2026-06-09)

## 1. What & Why

- **要做什么**：Last Mile 写 gate（`assertToolWriteAllowed`）+ per-tool policy 矩阵 v1；**自动策略优先**，适配非开发者用户画像。
- **为什么现在做**：B4/B5 接 AI 写工具硬阻塞；避免 Claude Code 式「权限弹窗疲劳」导致研究者盲目点允许。
- **不做什么**：不引入 bash/终端权限 UI；不替代 A11 结构化写预览；不实现 MCP trust（属 B11 另 spec）。

## 2. 用户场景

1. 语言学家只读查询句段/统计：工具自动执行，**无**权限确认弹窗。
2. AI 提议在 scope 内改 gloss：用户看到 **preview-diff**（A11），确认后写入；gate 在 executor 入口再验 scope。
3. AI 试图写 scope 外或 destructive 工具：gate **自动 block** + audit + 用户可见 explainability，**不要求**用户判断技术风险。

## 3. 验收标准

- [ ] 只读 `localContextTools` 路径：零 `policy_pending`（除非用户显式 `ask_first` 偏好）
- [ ] 超 scope / destructive 写：100% block + `ai_tool_call_decision` audit
- [ ] 写工具：必经 A11 preview（`approvalMode: propose_changes`）再 `commitToolEffects`；无 bash 式对话框
- [ ] `npm run typecheck`；`npx vitest run src/ai/policy/* src/ai/**/toolWriteGate*.test.ts`（Implement 后路径）
- [ ] `npm run check:agent-evals:smoke`；`policy-deny-01` / `policy-ask-01` 回归绿

## 4. 受影响代码地图

| 类别 | 路径 | 改动 |
| --- | --- | --- |
| Policy | `src/ai/policy/aiToolPolicyMatrix.ts`、`resolveExecutionPolicy.ts` | 矩阵列扩展 |
| Gate | `src/ai/runtime/toolWriteGate.ts`（新） | `assertToolWriteAllowed` |
| Pipeline | `src/ai/chat/toolDecisionPipeline.ts` | 只读自动放行路径 |
| Executor | `localContextToolExecutors`、B4 adapters | 统一 gate 入口 |
| Config | `featureFlags.ts` | `aiToolWriteGateEnabled` |
| i18n | `dictKeys` + `aiChatCardMessages` | block 原因文案 |

## 5. 已知风险与依赖

- 依赖 A6 F4 Batch B 写 executor 登记完成
- 与 A11 Preview 顺序：preview 展示 ≠ gate 豁免；executor 仍 Last Mile 再验
- 用户 `sessionMemory.toolPreferences.autoExecute=ask_first` 为高级降级，非 B4 默认
