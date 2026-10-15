---
title: Architecture 文档索引
doc_type: architecture-index
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: architecture-index
---

# Architecture 文档索引

产品形状只有 [仓库现状与代码地图.md](./仓库现状与代码地图.md)。其余是合同或操作步骤，在 `AI_QUICKSTART.md` 路由命中、源码注释点名，或检查失败时才读。

## 现状

- [仓库现状与代码地图.md](./仓库现状与代码地图.md)
  - 用途：一页产品形状。文件清单、schema 版本和行数不在这里。

## 按任务打开的合同

- [transcription-voice-action-id-registry-contract.md](./transcription-voice-action-id-registry-contract.md)
  - 用途：`ActionId` 与 `voiceIntentUi`、`dictKeys`、双语字典、`VoiceIntentLlmResolver` 允许列表的注册一致性；校验入口 `npm run check:transcription-text-telemetry-contract`。

- [offline-pwa-first-visit-expectations.md](./offline-pwa-first-visit-expectations.md)
  - 用途：PWA / Service Worker 与**首次访问、冷启动、precache 边界**的用户预期（勘误表 C-3）。

- [术语表.md](./术语表.md)
  - 用途：产品词（项目、文稿、项目包）与 layer / tier / track / lane 的边界。

- [timeline-unit-governance.md](./timeline-unit-governance.md)
  - 用途：时间轴单元的现行命名与读模型边界。

- [dexie4-safari-transaction-psd-patterns.md](./dexie4-safari-transaction-psd-patterns.md)
  - 用途：Dexie 4 在 Safari 上的事务作用域和 PSD 写法。决策边界见 ADR-0006。

- [language-metadata-geodata-and-picker-strategy.md](./language-metadata-geodata-and-picker-strategy.md)
  - 用途：语言元数据的国家列表来自仓库内静态快照，不再依赖 `country-state-city`。

- [dmlex/README.md](./dmlex/README.md)
  - 用途：DMLex 1.0 JSON Schema 副本。词典编辑基准见 ADR-0035。

- [provider-neutral-orthography-interop-contract.md](./provider-neutral-orthography-interop-contract.md)
  - 用途：正字法互操作的长期兼容性合同。

- [CSS架构与模板复用规范.md](./CSS架构与模板复用规范.md)
  - 用途：CSS 分层边界、命名规范、治理脚本与面板/对话框自动模板约定。

- [CSS浏览器兼容矩阵.md](./CSS浏览器兼容矩阵.md)
  - 用途：CSS 现代特性兼容策略、降级规则与 CI 校验入口。

- [桌面端浏览器支持策略.md](./桌面端浏览器支持策略.md)
  - 用途：产品对外兼容边界（桌面端 Chrome / Edge / Firefox / Safari 及国内双核浏览器的极速模式）；与 CSS 矩阵分工明确。

- [ai-chat-tool-confirm-idempotency.md](./ai-chat-tool-confirm-idempotency.md)
  - 用途：AI 聊天工具确认链路的幂等与审计契约（含 `propose_changes` 批处理、trace 与 `metadata.executed` 语义）。

- [ai-agent-runtime-security-local-first.md](./ai-agent-runtime-security-local-first.md)
  - 用途：Agent 运行时安全本地优先策略（Last Mile 写 gate、semantic guard、agentRunId 审计）；排期见主路线图 A6–A14。

- [ai-durable-agent-loop-recovery-scope.md](./ai-durable-agent-loop-recovery-scope.md)
  - 用途：`agent_loop` 在 token 预算移交后能恢复什么、不承诺什么。

- [code-governance-plan-2026-05-06.md](./code-governance-plan-2026-05-06.md)
  - 用途：落位规则与门禁。热点以当次 `npm run check:architecture-guard` 为准。本文不记行数。

- [ReadyWorkspace-数据域与壳层装配边界.md](./ReadyWorkspace-数据域与壳层装配边界.md)
  - 用途：`useTranscriptionData`（`data`）与波形桥 / UI state / segment scope 的职责边界；时间轴交互 `domainWrite`+`hostWrite` 装配纪律，防止 `data.xxx` 壳层误接导致的运行期 `undefined`。

## 收录原则

- 产品形状只写仓库现状那一页。
- 新合同必须在 `AI_QUICKSTART.md` 路由表写明什么任务才读。没有加载条件的散文不收。
- 为什么放 `docs/adr/`。已接受的 ADR 不改结论。
- 不放阶段性实施拆解、一次性修复清单、某一轮发布的验证记录，或只对当时开发过程有效的临时说明。
