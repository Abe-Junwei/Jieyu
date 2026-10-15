---
title: AI_QUICKSTART — 解语跨工具 AI 上手指引
doc_type: agent-quickstart
status: active
owner: repo
last_reviewed: 2026-10-15
applies_to: ["cursor", "github-copilot", "kimi-cli"]
---

# AI_QUICKSTART — 解语 (Jieyu) 跨工具 AI 上手指引

> **本文是新会话第一份必读文档**。AGENTS.md 在文头要求三工具（Cursor / GitHub Copilot / Kimi-cli）会话开始先读本文。≤ 200 行 signal-dense。

## 1. 每次先读

1. [copilot-instructions.md](copilot-instructions.md) — **项目级工程约束 canonical 中文正文**（编排层与 controller 边界、复杂度阈值、面板 CSS 双层边框、五阶段工作流，含 Research）。**非 trivial 任务必读**。
2. [docs/architecture/code-governance-plan-2026-05-06.md](docs/architecture/code-governance-plan-2026-05-06.md) — **代码治理**（落位例外与门禁）。热点以当次 `npm run check:architecture-guard` 为准。
3. [docs/architecture/仓库现状与代码地图.md](docs/architecture/仓库现状与代码地图.md) — **一页产品形状**（本检出是浏览器 / Dexie；Electron 与桌面存储是已接受目标）。不在这里查 flag、schema 版本或行数。

ReadyWorkspace 装配和主路线图不在每次必读里。碰到才读 §2 对应行。

## 2. task → doc 路由表（按任务类型挑读）

| 任务类型 | 先读 | 再读 |
| --- | --- | --- |
| 改时间轴 / 时间轴单元 / 时间轴布局 | [timeline-unit-governance.md](docs/architecture/timeline-unit-governance.md) | [ReadyWorkspace-数据域与壳层装配边界.md](docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md) |
| 改 ReadyWorkspace / 侧栏 / 媒体生命周期 | [ReadyWorkspace-数据域与壳层装配边界.md](docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md) | [仓库现状与代码地图.md](docs/architecture/仓库现状与代码地图.md) |
| 改页面 controller / orchestrator | [copilot-instructions.md](copilot-instructions.md) §一 / §三 / §五 | [code-governance-plan-2026-05-06.md](docs/architecture/code-governance-plan-2026-05-06.md) |
| 改 AI chat / tool / message formatter | `src/ai/messages/` 与 `src/ai/chat/`；UI 文案 vs formatter 分层见 [copilot-instructions.md](copilot-instructions.md) 权威范围段 | 聊天窗口是 `src/pages/TranscriptionPage.ChatWindow.tsx`。触及 `src/ai/**` 跑 `check:agent-evals:full` |
| 看当前阶段或排期 | [试用地图](docs/wayfinder/trial-handoff/map.md) | [主路线图](docs/execution/plans/解语-主路线图-master-roadmap-2026-06-01.md) |
| 发布前检查 | 本文 §4 | 桌面试用发布以 [GitHub #282](https://github.com/Abe-Junwei/Jieyu/issues/282) 为准 |
| Agent 运行时架构 / 写 gate / Runner / workflow | [主路线图 A6–A15](docs/execution/plans/解语-主路线图-master-roadmap-2026-06-01.md) | 架构迁移试点是切片 A15、[#314](https://github.com/Abe-Junwei/Jieyu/issues/314)：R0/R1 与第一程并行，R2 不进试用版默认路径。[ai-agent-runtime-security-local-first.md](docs/architecture/ai-agent-runtime-security-local-first.md) · `src/ai/runtime/commitToolEffects.ts` |
| 改 db schema / persistence | [ADR-0046](docs/adr/0046-desktop-sqlite-project-folder.md)；写→reload→readback 见 [AGENTS.md](AGENTS.md) §4 | 定向 `vitest` |
| 改本地上下文工具 | `src/ai/chat/localContextTools.ts` | 定向 `vitest` |
| 改 CSS / 面板视觉层级 | [copilot-instructions.md](copilot-instructions.md) §九 双层边框规则 | [CSS架构与模板复用规范.md](docs/architecture/CSS架构与模板复用规范.md) · [CSS浏览器兼容矩阵.md](docs/architecture/CSS浏览器兼容矩阵.md) |
| 新用或敏感的浏览器 API | [桌面端浏览器支持策略.md](docs/architecture/桌面端浏览器支持策略.md) | `npm run test:e2e:chromium` |
| 改转写深链 / 语音 ActionId | `src/utils/transcriptionUrlDeepLink.ts` | [transcription-voice-action-id-registry-contract.md](docs/architecture/transcription-voice-action-id-registry-contract.md) |
| 改层名 / tier / track / unitId | [术语表.md](docs/architecture/术语表.md) | [ADR-006](docs/adr/adr-006-linguistic-subgraph-unitid-utterances-retirement.md) |
| 改词典 / 正字法互操作 | [dmlex/README.md](docs/architecture/dmlex/README.md) | [provider-neutral-orthography-interop-contract.md](docs/architecture/provider-neutral-orthography-interop-contract.md) |
| 改浏览器 Dexie 事务 / PWA | [dexie4-safari-transaction-psd-patterns.md](docs/architecture/dexie4-safari-transaction-psd-patterns.md) | [offline-pwa-first-visit-expectations.md](docs/architecture/offline-pwa-first-visit-expectations.md) |
| 改语言元数据国家列表 | [language-metadata-geodata-and-picker-strategy.md](docs/architecture/language-metadata-geodata-and-picker-strategy.md) | 定向 `vitest` |
| 改 Web 协作 | [ADR-0047](docs/adr/0047-desktop-build-strips-collab-keys-telemetry.md) · [ADR-0034](docs/adr/0034-collaboration-project-snapshot-by-project.md) | `supabase/sql/001_collaboration_baseline.sql` |
| 改 AI send-turn / 确认 / 回滚 / loop | `src/hooks/ai/` 下的 send-turn 模块 · [ai-chat-tool-confirm-idempotency.md](docs/architecture/ai-chat-tool-confirm-idempotency.md) | `getAiStructuralRollbackMaxSelectionIds` · [ai-durable-agent-loop-recovery-scope.md](docs/architecture/ai-durable-agent-loop-recovery-scope.md) |
| 改非听写语音路径 | [ADR-0027](docs/adr/0027-voice-unified-non-dictation-chat-path.md) | `src/services/voiceRuntimeLoaders.ts` |
| 改 i18n / 用户可见文案 | [DESIGN.md](DESIGN.md) | `src/i18n/dictKeys.ts` |
| 编排可治理性 / 深模块 / hotspot 行为测试（跨 Wave） | [code-governance-plan-2026-05-06.md](docs/architecture/code-governance-plan-2026-05-06.md) | [主路线图 A1](docs/execution/plans/解语-主路线图-master-roadmap-2026-06-01.md) |
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

**单人合并门槛 — 完成前必跑**：

1. `npm run typecheck`
2. 触及域的 `vitest`（例如 `npx vitest run src/hooks/transcription`）
3. 触及交互 / ReadyWorkspace / 侧栏 / 时间轴时还要：`npm run test:e2e:chromium`
4. 触及编排 / 复杂度时还要：`npm run check:architecture-guard`

**机器守卫（工具无关，未跑 = 不算完成）**：

- `npm run check:architecture-guard` — 编排层 / controller 边界 / 复杂度上限
- `npm run check:agent-evals:smoke`（pre-merge）/ `:full`（AI 改动） — 典型 AI 失误
- `npm run check:docs-governance` — 文档放错位置
- `npm run check:dev-agent-workflow-verify` — SDD 触发 vs spec 活动 + Research 填实（Cursor stop hook 也会跑）
- `npm run check:r1-r8` — 三页产品路径 PR 须勾选 R1–R8 或写 N/A（含于 `check:all`）
- `npm run check:plans-frontmatter` — plans frontmatter 完整性
- `npm run check:current-state-freshness` — 现状文档 staleness（90d WARN / 180d FAIL）

**完整 L0 / L1 / L2 脚本分层**：见 [package.json](package.json) 头部注释。接近上限的文件以当次 `npm run check:architecture-guard` 为准。

## 5. 工作流速记（详见 [copilot-instructions.md](copilot-instructions.md) §五）

```
Explore  仅读本仓库，产出"已读事实"清单         Cursor Plan/Ask · Kimi --explore · Copilot Chat ask
   ↓
Research 向外调研业内成熟方案（新功能才强制）    Cursor WebSearch+context7 · Kimi web · Copilot web
         同类产品/标杆 · best practice/规范 · 公认不可行 · 潜在坑 → 复用/适配/自研结论
   ↓
Plan     产出落位 + 验证方式（承接 Research 结论），等用户确认
   ↓
Implement 执行；逐步 typecheck / 定向 vitest
   ↓
Commit   commit msg 附验证证据（命令 + 摘要）
```

**Plan 确认前 checklist**（SDD 触发见 [copilot-instructions.md](copilot-instructions.md) §5.2.1）：spec 三件套齐 → `design.md` §1 Research 填实（非占位符）→ 落位路径 + `npm run`/`vitest` 命令 → **用户确认 Plan** 后再 Implement。

**Cursor stop hook 自动 verify**（改过 `src/**/*.ts(x)`、`docs/execution/specs/`、`scripts/check-*.{mjs,cjs}` 或 `AGENTS.md` / `AI_QUICKSTART.md` / `copilot-instructions.md`）：`typecheck` → `check:agent-evals:smoke` → `check:dev-agent-workflow-verify`。

单文件 ≤ 10 行小修复可跳过 Explore + Research；新功能未做 Research 不得进入 Plan；Commit 验证证据不可省。完整 Research 维度见 [copilot-instructions.md](copilot-instructions.md) §5.1.5。

## 6. 文档治理

- 决定见 [ADR-0049](docs/adr/0049-decisions-not-current-state-inventories.md)。`docs/architecture/` 不新增第二份现状盘点。产品形状只写 [仓库现状](docs/architecture/仓库现状与代码地图.md) 这一页。Explore 不读整个目录，只读这一页和 §2 里本任务那一行。
- 已接受的 ADR 不改结论。决定变了就新写一篇，旧篇标 `superseded`。
- 文档和它点名的代码在同一次改动里更新。规格任务勾完就删目录，计划做完或放弃就删文件，试用单关闭就删本地文件；各类结束规则见 [ADR-0051](docs/adr/0051-every-doc-type-has-an-end.md)，`npm run check:docs-governance` 会拦。
- flag 默认值、schema 版本、行数写在代码和检查输出里，不写进散文。

## 7. 不要做（与外部模板的差异）

- 不引入 `src/features/...` / monorepo / nx / turbo。
- 不在 path-scoped `.cursor/rules/*.mdc` 里**分叉/内联规则正文**。允许 Cursor-only 的 path-scoped `globs:` 规则，但**仅作纯指针**（指向 AGENTS.md / copilot-instructions.md / docs 的 canonical 章节，≤ 10 行）；Kimi 遇到 `globs:` 是惰性忽略（非破坏），故不违反三工具一致。任何**权威规则正文**仍只写进 [AGENTS.md](AGENTS.md) 或 [copilot-instructions.md](copilot-instructions.md)。现有纯指针规则：`path-css-panels` / `path-pages-orchestration` / `path-ai-messages` / `path-db-persistence`。
- 不维护 **Claude Code 专属工作目录** `.claude/` 作为项目真相源。三工具基线以 **`AGENTS.md`** 为准；根目录 **`CLAUDE.md` 非必需**，若存在应仅为 `AGENTS.md` 镜像，**不得**作为与 `AI_QUICKSTART.md` / `copilot-instructions.md` 冲突的第三套权威正文。
- 不引 LangSmith / Braintrust SaaS（本地 `run-agent-evals.mjs` 够用）。
- 不引多 agent 编排。
- 不强制每 PR 跑 `:full` evals（`:smoke` 即可）。

---

**本文档维护规则**：行数硬上限 200；新增内容必须挤掉旧内容。`last_reviewed` 字段每次重大改动更新。
