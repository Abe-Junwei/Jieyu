---
title: agent-runtime-security-write-gate design
doc_type: execution-spec-design
status: draft
implementation_status: phase-2-3-landed-2026-06-09
owner: ai-governance
last_reviewed: 2026-06-09
source_of_truth: agent-runtime-security-write-gate-spec
depends_on:
  - ./requirements.md
  - ../../../architecture/ai-agent-runtime-security-local-first.md
  - ../../../architecture/ai-execution-capability-strategy-matrix-v0.md
---

# Design — Agent Runtime Security Write Gate (A7)

## 1. Research / 对标

- **仓库既有**：`resolveExecutionPolicy`、`resolveDestructiveGate`、`toolDecisionPipeline`（`policy_pending`）、`aiToolPolicyMatrix`
- **Anthropic**：*How We Contain Claude* — 环境 containment 优于审批疲劳；93% 批准率不适用于解语用户画像
- **解语约束**：[security-local-first](../../../architecture/ai-agent-runtime-security-local-first.md)「证据型、人在环」= **结构化写预览**，非权限对话框
- **决定**：**适配 + 自研** — 复用 policy 矩阵与 pipeline；新增 Last Mile gate；写确认走 A11 preview-diff

## 2. 用户画像与策略分层

| 层级 | 操作 | 系统行为 | 用户可见 |
| --- | --- | --- | --- |
| L0 只读 | `search_units`、`get_unit_detail` 等 | 自动 allow | 无弹窗 |
| L1 scope 内写 | 标注 gloss/POS（catalog 登记） | policy allow → A11 preview → gate 再验 → commit | diff 清单确认 |
| L2 超 scope | 写非当前 track/项目 | gate block | explainability + audit |
| L3 destructive | delete / batch 等 | gate block 或 A6 开关 off | 明确拒绝文案 |
| L4 用户偏好 | `ask_first` | 尊重 session JIT | 非 B4 默认路径 |

**非目标**：Cowork 式全 VM；Claude Code 式「Allow bash」按钮。

## 3. 架构与落位

```text
toolDecisionPipeline
  → resolveExecutionPolicy (只读: 跳过 policy_pending)
  → [写路径] A11 Preview (propose_changes)
  → executor
       → assertToolWriteAllowed(tool, scope, matrix)  // Last Mile
       → commitToolEffects (A10)
```

| 文件 | 职责 |
| --- | --- |
| `src/ai/runtime/toolWriteGate.ts` | scope/trust/destructive 判定纯函数 |
| `src/ai/policy/aiToolPolicyMatrix.ts` | per-tool：`read`/`write`/`destructive`、scope 绑定 |
| `src/ai/chat/toolDecisionPipeline.ts` | 只读短路；写保留 preview 分支 |

## 4. 与 A10/A11 边界

- **A10**：gate 失败不调用 `commitToolEffects`；成功写仅经 Runner 提交
- **A11**：preview 内容来自 catalog `supportsPreview`；gate 不重复生成 preview

## 5. 测试策略

- 单元：`assertToolWriteAllowed` 规则表（scope 内/外、destructive、flag off 回归）
- 集成：`toolDecisionPipeline` 只读无 pending；写 mock preview 链
- eval：`policy-deny-01`、`destructive-false-allow-01`、`no-silent-write-01`

## 6. ADR

- 无需新 ADR；扩展现有 [security-local-first](../../../architecture/ai-agent-runtime-security-local-first.md) §3 A7 行即可
