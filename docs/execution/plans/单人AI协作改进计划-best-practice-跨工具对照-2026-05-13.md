---
title: 单人 AI 协作改进计划 — best practice 对照与跨工具统一（v4 落地版）
doc_type: execution-plan
status: active
owner: repo
last_reviewed: 2026-05-13
source_of_truth: solo-ai-multi-tool-improvements-v4-2026-05-13
extends: ./单人AI协作改进计划-拍板决策-2026-05-11.md
depends_on:
  - ../../../AGENTS.md
  - ../../../AI_QUICKSTART.md
  - ../../../copilot-instructions.md
  - ../../architecture/code-governance-plan-2026-05-06.md
---

# 单人 AI 协作改进计划 — best practice 对照与跨工具统一（v4 落地版）

## 一、本计划的边界

- 项目使用的 AI 工具固定为 **Cursor + GitHub Copilot + Kimi-cli** 三件套；不使用 Claude Code。
- 总原则：所有规则与执行约束必须能被三工具**统一**自动遵循；任何只对其中 1–2 个工具生效的机制不进入主路径。
- 拍板 8A：本方案 extends `单人AI协作改进计划-拍板决策-2026-05-11.md`（宪法）；本方案是增量落地说明。

## 二、三工具规则加载机制（事实）

**唯一跨工具自动加载层 — `AGENTS.md`（仓库根）**：

- Cursor：原生在每会话开始读取
- GitHub Copilot：官方支持（Copilot priority stack 第 4 位）
- Kimi-cli：通过 `${KIMI_AGENTS_MD}` 模板变量自动注入 system prompt

**Path-scoped 规则**：Cursor 与 Copilot 各自支持但 Kimi 不支持（[Moonshot Issue #1747](https://github.com/MoonshotAI/kimi-cli) 仍是 feature request）→ **本方案不引入任何 path-scoped 规则**，避免破坏三工具一致性。

**Cursor-only 增强**（保留，作为指针层）：

- `.cursor/rules/jieyu-agent-instructions-pointer.mdc`（`alwaysApply: true`）：保证 AI_QUICKSTART / AGENTS.md / copilot-instructions.md 在 Cursor system prompt。
- `.cursor/rules/jieyu-docs-governance.mdc`（`alwaysApply: true`）：保证 docs 结构规则；与 AGENTS.md / copilot-instructions.md 引用对齐。

**机器守卫兜底**（工具无关，未跑 = 不算完成）：

- `npm run check:architecture-guard` — 编排层 / controller 边界 / 复杂度上限
- `npm run check:agent-evals[:smoke|:full]` — 典型 AI 失误
- `npm run check:docs-governance` — 文档放错位置
- `npm run check:plans-frontmatter` — plans frontmatter 完整性
- `npm run check:current-state-freshness` — 现状文档 staleness（90d WARN / 180d FAIL）
- `npm run typecheck` + 定向 `vitest` — 正确性回归

## 三、本次落地的 11 项（按优先级）

### P0 — 立即（已完成 2026-05-13）

| # | 项 | 关键产出 |
| --- | --- | --- |
| 1 | AGENTS.md 跨工具权威 + 删冗余指针 | 删 `CLAUDE.md` / `.github/copilot-instructions.md` / `.claude/`；`AGENTS.md` 重写为 133 行 signal-dense；`copilot-instructions.md` §0.1 改为指向 AGENTS.md 的单行指针，保留 §0.2 Jieyu 项目级硬规则 |
| 2 | AI_QUICKSTART 作为"先看哪里"路由器 | `AI_QUICKSTART.md`（125 行）含 5 must-know + task→doc 路由表 + 跨工具子 agent 决策表 + 自动同步 hotspot 块；`scripts/sync-ai-quickstart-hotspots.mjs` + `npm run sync:ai-quickstart-hotspots` |
| 3 | Plans 池信号噪声整理 | 37 个 plans 补 frontmatter；`scripts/check-plans-frontmatter.mjs` 守卫；`scripts/generate-plans-readme.mjs` 自动生成 active-only README（62 active / 8 closed）；`docs/execution/archive/plans-closed/` 承接未来 closed plans |

### P1 — 2 周内（已完成 2026-05-13）

| # | 项 | 关键产出 |
| --- | --- | --- |
| 4 | Explore → Plan → Implement → Commit 四阶段 | `copilot-instructions.md` §五 完整展开；三工具映射；Commit 验证证据模板；`AGENTS.md` 加短引用 |
| 5 | Spec-Driven Development 三件套 | `docs/execution/specs/_template/`（`requirements.md` ≤60 / `design.md` ≤100 / `tasks.md` ≤60）；触发条件写入 §5.2.1（≥ 1 新 controller / 跨 ≥ 3 controller / schema 迁移 / 新 flag） |
| 6 | 分层 evals + prod-failure 反哺 | `tiers: ["smoke", "full"]` 字段；`run-agent-evals.mjs` 支持 `--tier`，且 `--tier=smoke` 默认写入独立的 `release-evidence/agent-evals-report.smoke.json`（不再覆盖 full 快照）；3 个 smoke case 覆盖 3 类典型 AI 失误（typecheck 错读路径 / architecture-guard-core 业务逻辑落到编排层 / ai-messages-isolation UI 文案落到 src/ai/messages）；`check:agent-evals:smoke` ~12s |
| 7 | 现状文档 staleness 守卫 | `scripts/check-current-state-freshness.mjs`（90d WARN / 180d FAIL）；扫描 `doc_type: architecture-current-state` + 白名单；`lint-staged.config.mjs` 在 `src/pages` / `src/db` 改动时触发软提示 |

### P2 — 半年内对外前（已完成 2026-05-13）

| # | 项 | 关键产出 |
| --- | --- | --- |
| 8 | 跨工具子 agent 决策表 | 已含于 `AI_QUICKSTART.md` §3（Cursor `Task` subagent_type / Kimi YAML subagent / Copilot 直接工具） |
| 9 | Hotspot ratchet trend | `rule-builders.mjs` 文档化 `floorTrendDays` + `floorSetAt` opt-in 字段；`check-architecture-guard.mjs` 加 trend WARN 逻辑 |
| 10 | Script L0/L1/L2 分层 | `package.json` 顶部加 tier reference 注释；M2–M14 区段加 `// === Legacy Milestone Gates ===` 分组注释（**不重命名**，避免破 CI 9 处引用） |
| 11 | Feature flag 极简框架 | `src/featureFlags.ts`（boolean / string enum；localStorage > `import.meta.env` > defaults）；`copilot-instructions.md` §5.5 工作流约束 |

## 四、新 npm scripts 汇总

```
sync:ai-quickstart-hotspots         # 把 hotspots:auto 块用 top-15 prod files 重写
check:plans-frontmatter             # 守卫 plans frontmatter 完整性
check:current-state-freshness       # 守卫 architecture current-state staleness
generate:plans-readme               # 自动生成 active-only plans README
check:agent-evals:smoke             # ~90s 核心 3 case（L1 接线）
check:agent-evals:full              # 完整 case（AI 改动 / release 前）
```

## 五、刻意不做（与外部 best practice 主动对比）

- 不维护 Claude 专用入口（无 `CLAUDE.md` / 无 `.claude/`）。
- 不建 path-scoped 规则文件（Kimi 不支持，违反三工具一致原则）。
- 不保留 `.github/copilot-instructions.md`（与 AGENTS.md 重复）。
- 不引 LangSmith / Braintrust SaaS（与拍板 7A 一致；本地 `run-agent-evals.mjs` 够用）。
- 不照搬 Pieter Levels 零单元测试（Jieyu 规模远超 indie 工具）。
- 不引多 agent 编排（与 Cognition Labs 单 agent + 上下文工程一致）。
- 不强制每 PR 跑 `:full` evals（`:smoke` 即可）。
- 不复制 GitHub Spec Kit `/specify` slash command（Cursor 已有 Plan mode；Kimi/Copilot 也都有原生命令）。
- 不引 monorepo / nx / turbo。
- 不做 CODEOWNERS / 多角色 review / SLO/on-call。

## 六、与拍板宪法的关系

本方案对应拍板宪法的延伸落地：

| 拍板项 | 选项 | 本方案落地 |
| --- | --- | --- |
| 1B（半年内可能对外） | B | 项 11 feature flag 框架预留 |
| 2A（合并前验证） | A | AI_QUICKSTART §4 合并门槛清单；项 6 smoke evals 接 L1 |
| 6A（最小 i18n hygiene） | A | 项 6 ai-messages-isolation 守卫覆盖 UI 文案 vs formatter 分层 |
| 7A（自用工具优先） | A | 不引 SaaS；feature flag 仅本地（localStorage + import.meta.env） |
| 8A（improvement plan 收口） | A | 本文件即落盘载体 |

## 七、后续行动（不在本方案内但已就位）

- **季度 hotspot 评审**：用 `npm run report:architecture-hotspots` 挑 95%+ 项瘦身；给具体 controller 加 `floorTrendDays` 启动 trend 跟踪。
- **per-feature spec 实战**：下一个中等复杂度任务用 `docs/execution/specs/<feature-slug>/` 三件套走完整 Explore → Plan → Implement → Commit。
- **prod-failure 反哺**：首次 AI 引入的产线 bug 按 §5.3.2 流程补 eval case 后再修。

## 八、验证证据（落地当天 2026-05-13）

```
npm run typecheck                       → 0 errors
npm run check:architecture-guard:core   → OK
npm run check:docs-governance           → 398 markdown files validated
npm run check:plans-frontmatter         → 70 active + 0 archived plans validated
npm run check:current-state-freshness   → 8 fresh / 0 warn / 0 fail (in-scope=8)
npm run check:agent-evals:smoke         → 3/3 passed, ~12s
node scripts/check-ai-messages-isolation.mjs → OK
```
