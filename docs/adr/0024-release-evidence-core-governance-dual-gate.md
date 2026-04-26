---
title: ADR 0024 — release-evidence core 与 governance 双闸
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-26
source_of_truth: architecture-decision
---

# ADR-0024：release-evidence「core 执行闸」与「governance 策略闸」双轨关系

## 背景

仓库内存在两类与 release evidence 相关的入口：

1. **`gate:release-evidence:core` / `gate:release-evidence:full`**：对 `generate-release-evidence-bundle.mjs` 使用 **`--mode=enforce`**（或等价默认），在生成完整证据包时执行卡片/schema、字典、退化（degraded）等**结构性**断言。  
2. **`gate:release-evidence:governance`**：先用 **`--dry-run`** 写出一份用于检查的 JSON，再运行 **`check-release-evidence-governance.mjs`**，对 **`costGuard.trend`** 与 **`actionApprovalCenter.summary`** 做**策略性**阈值校验（可选 strict：compareReady、比例上限、高风险信号等）。

口头上的「单一权威入口」易误解成只跑其一即可；与实现不一致。

## 决策

- **发布/CI 语义上的「通过」**：以 **当前 `.github/workflows/ci.yml` 中为 `release-evidence-*-gate` job 实际编排的顺序为准**——先跑 **core（enforce）**，再跑 **governance（dry-run + check 脚本）**；**两段均须通过**，缺一不可。  
- **职责划分**：  
  - **Core（enforce）**：证据包是否完整、字段是否满足契约、是否出现不应发布的 degraded 等。  
  - **Governance**：在同一份（或 dry-run 生成的）报告上叠加 **成本趋势可比较性** 与 **人工审批/风险分布** 等运维策略；strict 变体通过 **独立 npm script** 与 **workflow_dispatch 输入** 收紧，而非替换 core。  
- **Strict 附加项**：在 `check:release-evidence:governance:strict` 中可叠加 **`--min-approval-total=<n>`**（`n>=1`），要求 `actionApprovalCenter.summary.total >= n`，避免极小样本偶然通过比例类门槛；非 strict 默认不传，保持小分支/本地 dry-run 兼容。

## 影响

- 文档与 runbook 应明确写「**core + governance**」，避免只写其中一个。  
- 新增治理参数时：**默认 CI 路径**保持宽松；**strict** 通过 `package.json` 的 `*:strict` 脚本与 CI 条件分支集中配置。

## 备选方案（未采纳）

- **仅保留 governance**：会弱化 enforce 阶段对整包 schema 的硬约束。  
- **合并为单脚本**：单文件职责过重，dry-run 与 enforce 的输入/缓存策略不同，维护成本高。

## 回顾点

- 若将来「权威」改为单脚本，应新增 superseding ADR 并同步改 CI。  
- `min-approval-total` 阈值若随 fixture 漂移频繁失败，应回到本 ADR 调整策略或提高种子数据量，而非静默下调到 0。
