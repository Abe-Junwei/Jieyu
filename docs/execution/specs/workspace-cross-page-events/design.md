---
title: workspace-cross-page-events design
doc_type: execution-spec-design
status: active
owner: corpus
last_reviewed: 2026-09-20
source_of_truth: workspace-cross-page-events-spec
depends_on:
  - ./requirements.md
  - ../../plans/标注词典语料-治理补充规范-2026-04-25.md
---

# Design — Workspace Cross-Page Events (B2)

## 1. 成熟方案扫描 / Research

- 仓库既有：`jieyu:open-search` / `notifyAiTasksUpdated` / `jieyu:db-migrating` 都是 **window `CustomEvent`** + `addEventListener`；`workspaceLayoutPreferenceSync` 才用 `storage` 做跨标签。
- 同类产品：ELAN 用内部 selection/change 通知刷新 Concordance，不整页重载；FLEx 词典与 Texts 用脏标记，未保存记录不覆盖。
- 业内：浏览器同页用 DOM CustomEvent；跨标签才上 BroadcastChannel。React Query 用 `invalidateQueries` / `setQueryData`，避免 `window.location.reload`。
- 公认不可行：`document.execCommand` 式全局 reload；Node `EventEmitter` 进页面；把事件写进 Dexie 当事务日志；从 ChatWindow 发刷新。
- 潜在的坑：2026-06 审计写 `appShellEvents` 已有总线，接线前**生产代码没有**；初版因导入风暴让 `saveUnitsBatch` 静默，但标注 `saveAnnotationUnitMeta` 走 `saveBatch`，故本切片改为 persist 后按 **unique unitId** emit。`token_lexeme_links` 无 unitId，须查 `unit_tokens` / `unit_morphemes`。`saveUnitText` 是 P0-2「提交文本」单写路径，必须 emit；草稿覆盖是合同硬约束。
- 决定：**复用** 仓内 CustomEvent 模式；**适配** 治理规范 §3.2 名字与幂等键；**自研** 去重 + 草稿门；**不**上 BroadcastChannel。

## 2. 架构选择

- 落位：`actions`（persist 后 emit）+ `effect`（订阅 invalidate）
- 方案 A：LinguisticService 写成功后 emit，页面 hook 订阅 — **选 A**（转写 hotspot 零触及）
- 拒绝：在 Orchestrator / ChatWindow 堆积回调；默认 `listByTextId` 全量当唯一路径

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `workspaceEvents.ts` | 类型、dispatch/subscribe、去重决策 | < 160 |
| `useWorkspaceEventRefresh.ts` | 一处订阅 | < 80 / 1 effect |
| `linguisticServiceUnitTokenOps.ts` 等 | persist 后 emit | +数行 |
| annotation/corpus/LexiconPage | 按 unit/lexeme invalidate | +1 hook |

约束自查：不引入 `src/features/`；ChatWindow 零触及；页面不 `import` `../services`。

## 4. ADR 引用

- 治理规范 §3.2（事件合同 v1）
- 新建 ADR：否（可逆的同页通知，不是持久化协议）

## 5. Feature flag

- 不新增。沿用已有页面 flag。

## 6. 失败模式 / 兼容性

- 无 `window`：emit no-op
- 重复 key：丢弃
- 有草稿：不 refetch 该 unit
- `context-sync`：仅 API，禁止写库
- 回滚：删除订阅

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/utils/workspaceEvents.test.ts src/hooks/useWorkspaceEventRefresh.test.tsx src/pages/AnnotationPage.test.tsx src/pages/CorpusLibraryPage.test.tsx src/pages/LexiconPage.test.tsx` | pass |
| 守卫 | architecture-guard / docs / workflow | OK |
