---
title: AI_QUICKSTART — 解语跨工具 AI 上手指引
doc_type: agent-quickstart
status: active
owner: repo
last_reviewed: 2026-05-13
applies_to: ["cursor", "github-copilot", "kimi-cli"]
---

<!--
hotspots:auto 区间由 `npm run sync:ai-quickstart-hotspots` 自动重写，请勿手改。
-->

# AI_QUICKSTART — 解语 (Jieyu) 跨工具 AI 上手指引

> **本文是新会话第一份必读文档**。AGENTS.md 在文头要求三工具（Cursor / GitHub Copilot / Kimi-cli）会话开始先读本文。≤ 200 行 signal-dense。

## 1. 5 个 must-know（按阅读顺序）

1. [copilot-instructions.md](copilot-instructions.md) — **项目级工程约束 canonical 中文正文**（编排层与 controller 边界、复杂度阈值、面板 CSS 双层边框、四阶段工作流）。**非 trivial 任务必读**。
2. [docs/architecture/code-governance-plan-2026-05-06.md](docs/architecture/code-governance-plan-2026-05-06.md) — **代码治理执行计划**（hotspot ratchet、95% 利用率清单、季度瘦身规则）。
3. [docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md](docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md) — **ReadyWorkspace 装配硬约束**（API 不得从 `useTranscriptionData.data` 上取；`audit:ready-workspace-timeline-host` 守卫）。
4. [docs/architecture/仓库现状与代码地图.md](docs/architecture/仓库现状与代码地图.md) — **当前仓库现状**（页面 / controller / service / db / 编辑器布局；含 last_reviewed 日期，过期 90d+ 视为 stale）。
5. [docs/execution/plans/单人AI协作改进计划-拍板决策-2026-05-11.md](docs/execution/plans/单人AI协作改进计划-拍板决策-2026-05-11.md) — **单人 AI 协作 8 项拍板宪法**（决定哪些做 / 哪些刻意不做）。

## 2. task → doc 路由表（按任务类型挑读）

| 任务类型 | 先读 | 再读 |
| --- | --- | --- |
| 改时间轴 / 时间轴单元 / 时间轴布局 | [timeline-unit-governance.md](docs/architecture/timeline-unit-governance.md) | [ReadyWorkspace-数据域与壳层装配边界.md](docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md) |
| 改 ReadyWorkspace / 侧栏 / 媒体生命周期 | [ReadyWorkspace-数据域与壳层装配边界.md](docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md) | [仓库现状与代码地图.md](docs/architecture/仓库现状与代码地图.md) |
| 改页面 controller / orchestrator | [copilot-instructions.md](copilot-instructions.md) §一 / §三 / §五 | [code-governance-plan-2026-05-06.md](docs/architecture/code-governance-plan-2026-05-06.md) |
| 改 AI chat / tool / message formatter | `src/ai/messages/` 与 `src/ai/chat/`；UI 文案 vs formatter 分层见 [copilot-instructions.md](copilot-instructions.md) 权威范围段 | smoke evals 见 §4 |
| 改 db schema / persistence | [docs/architecture/ai-local-context-tool-governance.md](docs/architecture/ai-local-context-tool-governance.md)；写→reload→readback 验证硬规则见 [AGENTS.md](AGENTS.md) §4 | `vitest` 定向 |
| 改 CSS / 面板视觉层级 | [copilot-instructions.md](copilot-instructions.md) §九 双层边框规则 | [docs/architecture/CSS架构与模板复用规范.md](docs/architecture/CSS架构与模板复用规范.md) |
| 改 i18n / 用户可见文案 | [DESIGN.md](DESIGN.md) | `src/i18n/dictKeys.ts` |
| 编排可治理性 / 深模块 / hotspot 行为测试（跨 Wave） | [AI与代码库可治理性综合整改方案-2026-05-13.md](docs/execution/plans/AI与代码库可治理性综合整改方案-2026-05-13.md) | [code-governance-plan-2026-05-06.md](docs/architecture/code-governance-plan-2026-05-06.md) |
| 中等以上复杂度新功能（≥ 1 新 controller / 跨 ≥ 3 controller） | [docs/execution/specs/_template/](docs/execution/specs/_template/) 三件套（requirements / design / tasks） | [copilot-instructions.md](copilot-instructions.md) §五 |

## 3. 跨工具子 agent 委托决策表

不引入多 agent 编排（与 Cognition Labs 单 agent + 上下文工程一致）；仅在主 agent 之外按需委托。

| 场景 | Cursor | Kimi-cli | GitHub Copilot |
| --- | --- | --- | --- |
| 广搜代码 / 找文件 / 回答"在哪" | `Task` tool subagent_type=`explore` | `--explore` 模式或默认 agent + grep tool | 主 chat 直接用 codebase search |
| 并行调研多个模块 | `Task` subagent_type=`generalPurpose` | 不推荐多 agent 并行，分多轮主 agent | 主 chat 分多轮 |
| 命令密集（git / build / test 批量） | `Task` subagent_type=`shell` | 主 agent + shell tool | 主 chat + terminal tool |
| 浏览器测试 / 视觉对比 | `Task` subagent_type=`browser-use` | 不支持原生 browser；用 E2E 脚本 | 不支持原生 browser；用 E2E 脚本 |
| CI 失败调研 | `Task` subagent_type=`ci-investigator` | 主 agent + gh CLI | 主 chat + gh CLI |
| 自定义专用 system prompt | 用 `.cursor/rules/*.mdc` 内嵌 | YAML subagent 定义（[Kimi 文档](https://moonshotai.github.io/kimi-cli/en/customization/agents.html)），仅必要时；本仓库不引入自定义 subagent | 不支持，用直接工具 |

## 4. 合并门槛与机器守卫

**单人合并门槛（拍板 2A）— 完成前必跑**：

1. `npm run typecheck`
2. 触及域的 `vitest`（例如 `npx vitest run src/hooks/transcription`）
3. 触及交互 / ReadyWorkspace / 侧栏 / 时间轴时还要：`npm run test:e2e:chromium`
4. 触及编排 / 复杂度时还要：`npm run check:architecture-guard`

**机器守卫（工具无关，未跑 = 不算完成）**：

- `npm run check:architecture-guard` — 编排层 / controller 边界 / 复杂度上限
- `npm run check:agent-evals:smoke`（pre-merge）/ `:full`（AI 改动） — 典型 AI 失误
- `npm run check:docs-governance` — 文档放错位置
- `npm run check:plans-frontmatter` — plans frontmatter 完整性
- `npm run check:current-state-freshness` — 现状文档 staleness（90d WARN / 180d FAIL）

**完整 L0 / L1 / L2 脚本分层**：见 [package.json](package.json) 头部注释。

## 5. 当前 hotspot 列表（top 15 production files by line count）

<!-- hotspots:auto -->

> 自动生成于 2026-05-12T23:53:55.329Z（npm run sync:ai-quickstart-hotspots）。

| # | 文件 | 行数 |
| --- | --- | --- |
| 1 | `src/i18n/dictionaries/en-US.ts` | 3473 |
| 2 | `src/i18n/dictionaries/zh-CN.ts` | 3464 |
| 3 | `src/i18n/dictKeys.ts` | 2720 |
| 4 | `src/db/engine.ts` | 1756 |
| 5 | `src/components/TranscriptionTimelineVerticalViewGroupList.tsx` | 1710 |
| 6 | `src/utils/langMapping.ts` | 1682 |
| 7 | `src/components/VoiceAgentWidget.tsx` | 1625 |
| 8 | `src/components/SidePaneSidebarSegmentList.tsx` | 1570 |
| 9 | `src/db/schemas.ts` | 1518 |
| 10 | `src/components/TranscriptionTimelineVerticalView.tsx` | 1407 |
| 11 | `src/utils/layerDisplayStyle.ts` | 1345 |
| 12 | `src/components/ai/AiChatCard.tsx` | 1339 |
| 13 | `src/db/types.ts` | 1269 |
| 14 | `src/hooks/ai/useAiChat.sendTurnStreamPhase.ts` | 1215 |
| 15 | `src/hooks/transcription/useTranscriptionCloudSyncActions.ts` | 1157 |

<!-- /hotspots:auto -->

> 更新方式：`npm run sync:ai-quickstart-hotspots`（基于 `report:code-scale` 输出 top 15 production files）。
> 接近 ratchet 上限 ≥ 95% 的具体清单见 [code-governance-plan-2026-05-06.md](docs/architecture/code-governance-plan-2026-05-06.md)。

## 6. 工作流速记（详见 [copilot-instructions.md](copilot-instructions.md) §五）

```
Explore  仅读，产出"已读事实"清单            Cursor Plan/Ask · Kimi --explore · Copilot Chat ask
   ↓
Plan     产出落位 + 验证方式，等用户确认
   ↓
Implement 执行；逐步 typecheck / 定向 vitest
   ↓
Commit   commit msg 附验证证据（命令 + 摘要）
```

单文件 ≤ 10 行小修复可跳过 Explore；Commit 验证证据不可省。

## 7. 不要做（与外部模板的差异）

- 不引入 `src/features/...` / monorepo / nx / turbo。
- 不建 `.cursor/rules/*.mdc` 的 path-scoped `globs:`（Kimi 不支持 → 破坏三工具一致性）；想加规则就写进 [AGENTS.md](AGENTS.md) 或 [copilot-instructions.md](copilot-instructions.md)。
- 不维护 **Claude Code 专属工作目录** `.claude/` 作为项目真相源。三工具基线以 **`AGENTS.md`** 为准；根目录 **`CLAUDE.md` 非必需**，若存在应仅为 `AGENTS.md` 镜像，**不得**作为与 `AI_QUICKSTART.md` / `copilot-instructions.md` 冲突的第三套权威正文。
- 不引 LangSmith / Braintrust SaaS（本地 `run-agent-evals.mjs` 够用）。
- 不引多 agent 编排。
- 不强制每 PR 跑 `:full` evals（`:smoke` 即可）。

---

**本文档维护规则**：行数硬上限 200；新增内容必须挤掉旧内容。`last_reviewed` 字段每次重大改动更新。
