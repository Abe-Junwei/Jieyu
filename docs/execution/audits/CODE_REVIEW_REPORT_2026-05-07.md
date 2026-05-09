# Jieyu 全仓代码审查报告

**审查日期**：2026-05-07  
**审查范围**：`src/`（与 CI `quality` 及扩展门禁对齐）+ 与 [CODE_REVIEW_REPORT_2026-05-04.md](./CODE_REVIEW_REPORT_2026-05-04.md) 可对账维度  
**对照基线**：2026-05-04 报告 + [ARCH-3 architecture-guard 热点台账](../governance/arch3-architecture-guard-hotspots-2026-05-05.md)  
**执行摘要**：架构门禁、文档治理、分层与 DB 事务封装等**硬门禁全部通过**。**2026-05-08 复验**：`npm test`、`npm run gate:panel-phase1`、`npm run validate` 本机退出码 0；CSS 侧补齐 token/a11y、未使用选择器 baseline、债务阈值与 visual-css 快照。**2026-05-07 后续修复**：大规模 `madge` 环已拆除（见 `corpusScopeTypes.ts`、singleton 去 barrel、`toMcpToolSchema` 仅从 `mcpCompatibility` 导出）。**2026-05-08 末**：`localContext` 链上 **2** 条小环已通过 **`localContextToolTypes.ts`**（工具调用/结果类型）+ **`localContextToolScopeNormalize.ts`**（`normalizeUnitScope` / `normalizeProjectMetric`）+ **字符预算从 `useAiChat.config` 直连** 消除；`npx madge --circular --extensions ts,tsx src` → **0**。Vitest 默认 worker 上限与 `NODE_OPTIONS` 堆配置见 `vite.config.ts` / `package.json`；`McpServer.ts` 中误写 `McpRuntimeContext` 已改为 `McpServerRuntimeContext`。

---

## 质量仪表盘

| 维度 | 状态 | 说明 |
|------|------|------|
| TypeScript | ✅ 通过 | `npm run typecheck`，0 错误（`tsconfig.json`：**`noUnusedLocals` / `noUnusedParameters` 均已开启**；历史 TS6133 已通过专项 PR 回收） |
| 架构门禁 | ✅ 通过 | `npm run check:architecture-guard`（含 doc-symbol-parity、timeline 单宿主、telemetry、fire-and-forget） |
| Architecture 热点 | ✅ 通过 | `npm run report:architecture-hotspots` 无 WARN（与 ARCH-3「当前 0 预警」一致） |
| 循环依赖 | ✅ 已清零 | `npx madge --circular --extensions ts,tsx src` → **0**（2026-05-08：`localContext` 类型与 scope 归一化拆边后复验） |
| 分层 / tierId | ✅ 通过 | `npm run check:tierid-diffusion`（offBoundary=0）；`check:architecture-guard` 内 tier 相关子项通过 |
| DB 事务门面 | ✅ 通过 | `npm run check:db-transaction-facade` |
| 文档治理 | ✅ 通过 | `npm run check:docs-governance` |
| fire-and-forget | ✅ 通过 | `npm run check:fire-and-forget-governance`（38 文件） |
| Acceptance-1 | ✅ 通过 | `npm run check:acceptance-1` |
| 时间轴门禁 | ✅ 通过 | `npm run gate:timeline-phase1`（含 `test:timeline-regression` 44 用例 + `npm run build`） |
| 面板 phase1 | ✅ 通过 | **`npm run gate:panel-phase1`**（2026-05-08：foundation + `check:css-architecture` + `test:panel-regression`） |
| 全量 Vitest / `npm test` | ✅ 通过 | **2026-05-08** 本机 `npm test` 退出码 0（含 CSS/visual-css 全套守卫 + Vitest 全量）；**Node 22.22**（Homebrew `node@22`）上同命令复验通过（与 `.nvmrc` 对齐） |
| `npm run validate` | ✅ 通过 | **2026-05-08** `typecheck` + `gate:acoustic` + `npm test` + `build:guard`，退出码 0 |

---

## 与 2026-05-04 报告的差异摘要

| 项 | 2026-05-04 | 2026-05-07（本轮） |
|----|------------|-------------------|
| madge 循环链 | 32 → 05-07 初稿 3 → 05-07 末稿大规模 **0** → 05-08 曾回弹 **2**（`localContext` 拆分三角） | **0**（2026-05-08 末：`types` + `scopeNormalize` + config 直连拆环） |
| architecture-guard 热点 WARN | 7 | **0** |
| 全量单元测试 | 541/544 等口径 | 本机 **OOM 未结**，曾修复 `useAiChat.structure` 与 provider 解构不一致导致的结构测试失败 |

---

## 轮次 1：架构、依赖与循环

### 1.1 架构守卫

**命令**：`npm run check:architecture-guard`  
**结果**：`OK`（与 CI `quality` job 内嵌子集一致）。

### 1.2 热点只读扫描

**命令**：`npm run report:architecture-hotspots`  
**结果**：`architecture hotspot scan completed`，**无 WARN 行**（未逼近硬上限）。

### 1.3 循环依赖（madge）

**命令**：`npx madge --circular --extensions ts,tsx src`  

**结果（2026-05-08 末）**：`✔ No circular dependency found!`，**退出码 0**。

**已做拆环（05-07 大规模清零）**：

1. **VoiceAgentService**：去掉主文件对 `VoiceAgentService.singleton` 的 barrel 再导出；单例 API 仅从 [`VoiceAgentService.singleton.ts`](../../../src/services/VoiceAgentService.singleton.ts) 引用；主文件尾部保留 ADR-0028 说明注释；[`architecture-guard.config.mjs`](../../../scripts/architecture-guard.config.mjs) 同步更新 `requiredRegexes`。  
2. **corpus / sourceResolver**：新增 [`corpusScopeTypes.ts`](../../../src/ai/vertical/corpusScopeTypes.ts) 承载 `CorpusScope` / `CorpusSourceSet`；[`sourceResolver.ts`](../../../src/ai/vertical/sourceResolver.ts) 再导出类型；[`corpusSourceSet.ts`](../../../src/ai/vertical/corpusSourceSet.ts) 改从该文件引用。  
3. **aiToolRegistryShadow / mcpCompatibility**：移除 shadow 对 `toMcpToolSchema` 的再导出；测试与调用方从 [`mcpCompatibility.ts`](../../../src/ai/vertical/mcpCompatibility.ts) 直接导入。

**localContext 小环（05-08 曾出现 2 条，已消除）**：将 `LocalContextToolCall` / `LocalContextToolResult` / `LocalToolExecutionTraceOptions` 下沉至 [`localContextToolTypes.ts`](../../../src/ai/chat/localContextToolTypes.ts)；将 `normalizeUnitScope` / `normalizeProjectMetric` 下沉至 [`localContextToolScopeNormalize.ts`](../../../src/ai/chat/localContextToolScopeNormalize.ts)；`localContextTools.ts` 内工具指南字符串改用 **`AI_LOCAL_TOOL_RESULT_CHAR_BUDGET`**（[`useAiChat.config.ts`](../../../src/hooks/useAiChat.config.ts)），避免经 [`localContextToolFormatters.ts`](../../../src/ai/chat/localContextToolFormatters.ts) 回边；`localContextToolFormatters.ts` 中 `LOCAL_TOOL_RESULT_CHAR_BUDGET` 改为文件内常量（仍等于 config 值）。

### 1.4 面板基础（可选深门禁子集）

**命令**：`npm run check:panel-foundation`  
**结果**：`OK`（dialog 样式守卫 + CSS layer + architecture-guard 重复跑）。

**未跑**：完整 `npm run gate:panel-phase1`（含 `check:css-architecture` 与 `test:panel-regression`，耗时可观）。

---

## 轮次 2：类型与数据层

**命令**：`npm run typecheck`  
**结果**：通过。

**命令**：`npm run check:db-transaction-facade`  
**结果**：`src/services` 内无直接 `db.dexie.transaction(...)`。

**说明**：Dexie 迁移与 schema 未在本轮做逐文件 diff；与 05-04 相比无新增回归证据。

---

## 轮次 3：CSS 与 UI 契约

本轮**未**单独重跑 `npm test` 前置的整条 CSS 链（`check:css` … `test:visual-css`）。  
**间接证据**：`check:panel-foundation` 中的 `check:css-layer-boundary` 通过；完整 CSS 债务仍以 CI `quality` 中 `npm test` 为准。

---

## 轮次 4：测试与 CI 对齐

### 4.1 CI `quality` 对齐子集（本轮已跑）

与 [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) 中 `quality` job 一致部分：

- `npm run typecheck`
- `npm run check:fire-and-forget-governance`
- `npm run check:acceptance-1`
- `npm run report:architecture-hotspots`（CI 在 `npm test` 之后跑热点；本轮为取证亦在 guard 后跑）

### 4.2 全量 Vitest / `npm test`

**历史现象**（缓解前，本机 macOS，Node 25，`NODE_OPTIONS=--max-old-space-size=8192`）：长时间全量 `vitest run` 曾出现 **exit 134**（worker 或主进程堆顶 OOM）。

**已做缓解**（代码库内）：[`vite.config.ts`](../../../vite.config.ts) 将 `test.maxWorkers` 改为 **1**；[`package.json`](../../../package.json) 在 `npm test` 末尾的 `vitest run` 前增加 **`cross-env NODE_OPTIONS=--max-old-space-size=12288`**。

**建议验证**：以 **CI `quality` job** 的 `npm test` 全绿为发布门禁；本机若仍 OOM 可再抬高堆或分片运行。

### 4.3 结构守卫修复（本轮交付）

`src/hooks/useAiChat.structure.test.ts` 已与主 hook 中 **`createFallbackAiChatProvider` + 解构 `useMemo`** 实现对齐，避免仅匹配旧式 `const provider = useMemo(...)` 字符串。

**单文件验证**：`npx vitest run src/hooks/useAiChat.structure.test.ts` → 4/4 通过。

### 4.4 时间轴回归（深门禁）

**命令**：`npm run gate:timeline-phase1`  
**结果**：通过（含 `test:timeline-regression`：**44** 用例通过；`vite build` 成功）。

---

## 轮次 5：构建与安全

**命令**：`npm run gate:timeline-phase1` 内含 `npm run build`。  
**结果**：构建阶段成功（详见该 gate 日志）。

**未跑**：`npm run build:guard`（chunk 预算 + `npm audit`）；留待 `validate` 或发布前。

---

## 轮次 6：行为与数据流审计（Tier B，按域）

审查口径对齐 [AGENTS.md](../../../AGENTS.md) / [copilot-instructions.md](../../../copilot-instructions.md) §0.1：从**可达入口**追到**持久化 / 日志 / 读回**，结论附**为何机械检查可能漏掉**与**建议验证**。

### 6.1 转写主路径

- **入口**：`TranscriptionPage` → `ReadyWorkspace` → `useTranscriptionSegment*Controller` 等（architecture-guard 对 Orchestrator/ReadyWorkspace 仍有强制 regex 清单）。  
- **证据**：`gate:timeline-phase1` 通过；`check:transcription-text-telemetry-contract` 在 guard 内通过（134 ActionId / dict key）。  
- **缺口**：未在本轮做「单条写库 → reload」的手工路径复验；依赖现有 Vitest/E2E。

### 6.2 AI 对话、流式与审计

- **入口**：`useAiChat` → `runAiChatSendTurn`（`useAiChat.sendTurn*.ts` 管线）→ Dexie `ai_messages` / `audit_logs` 等。  
- **关注点**：`clear()` 内对 `audit_logs.insert` 的 **best-effort** 写入（`action: 'reset'` 等）与主线程 UI 清空顺序；异常被吞时仅影响审计可追溯性，**不阻塞**清会话。  
- **为何测试可能漏掉**：依赖子集与 CI 全量；本机全量曾受堆限制。  
- **建议验证**：CI 全绿 + 若有会话清理合规要求，补「清会话后 audit_logs 可查询」的集成用例。

### 6.3 MCP HTTP Server（非 UI 入口）

- **入口**：Node `http` server，`GET /sse` / `POST /messages`。  
- **行为**：`McpServer` 文档声明 **只读**；`handleRequest` 顶层 `.catch` → JSON-RPC 500（[`src/ai/mcp/server/McpServer.ts`](../../../src/ai/mcp/server/McpServer.ts)）。  
- **持久化**：`persistMcpToolCallAudit` 与工具表分流（见文件头 PR-15 注释）。  
- **建议验证**：已有 `McpServer.test.ts`；发布前跑 CI 中 `check:mcp-server:read-only`（若流水线启用）。

### 6.4 协作与语言资产

- **协作**：本轮未跑 `gate:collaboration-cloud`；云同步路径仍以既有合约测试与门禁为准。  
- **语言资产 / 面板 CSS**：仅 `check:panel-foundation`；**未**审计「两层 border」全路径；有 UI 变更时建议跑 `gate:panel-phase1` + 对照 `DESIGN.md` / `tokens.css`。

---

## 附录：本轮可复现命令清单

```bash
npm run typecheck
npm run check:fire-and-forget-governance
npm run check:acceptance-1
npm run check:architecture-guard
npm run report:architecture-hotspots
npm run check:docs-governance
npx madge --circular --extensions ts,tsx src
npm run check:db-transaction-facade
npm run check:tierid-diffusion
npm run check:panel-foundation
npm run gate:timeline-phase1
# 全量（本机可能 OOM，建议 CI）
NODE_OPTIONS=--max-old-space-size=8192 npx vitest run --maxWorkers=1
# 或仓库标准
npm test
```

---

## 后续建议（优先级）

1. **P0**：在 **CI** 确认 `npm test` 全绿；若本机需调试 Vitest OOM，尝试更大 `max-old-space-size`、或关闭部分 perf 用例的本地 profile。  
2. **P1**：维持 `madge` 零环回归（发版前随 `localContext*` 改动复跑）；历史 singleton / vertical / localContext 链上环已清。  
3. **P2**：择期跑 `npm run gate:panel-phase1`、`npm run validate` 作为发布前深跑，并把结果并入下一轮审查仪表盘。
