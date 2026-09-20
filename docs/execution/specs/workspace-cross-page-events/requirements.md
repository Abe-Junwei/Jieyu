---
title: workspace-cross-page-events requirements
doc_type: execution-spec-requirements
status: active
owner: corpus
last_reviewed: 2026-09-20
source_of_truth: workspace-cross-page-events-spec
---

# Requirements — Workspace Cross-Page Events (B2)

## 1. What & Why

- **要做什么**：落地治理规范 §3.2 的跨页事件合同（typed `dispatch` / `subscribe`），并在 unit / lexeme 写成功后让标注、语料、词典按 `unitId`/`lexemeId` 增量刷新。
- **为什么现在做**：语料 P0/P1 与标注写链已通；B6 断裂态已有。当前 `appShellEvents.ts` 只有 `jieyu:open-search`，路线图里的总线并不存在。
- **不做什么**：不接 ChatWindow；不改 ReadyWorkspace 装配；不上 BroadcastChannel / 多标签同步；不实现 `context-sync` 写库；不新增页面 flag；不把草稿覆盖成分页重拉。

## 2. 用户场景（≤ 3 条）

1. 标注保存 POS 后，已打开的语料列表只刷新对应 unit，其它行不动。
2. 标注行有未提交草稿时，外来 `unit-updated` 不覆盖该行输入。
3. 重复 `idempotencyKey` 第二次到达被丢弃。

## 3. 验收标准（可测）

- [x] 四类事件名与最小 payload 与治理规范 §3.2 一致
- [x] 同 `idempotencyKey` 第二次 `apply` 为 false
- [x] 目标页有未提交草稿 → `mark-dirty`，不 refetch 该 unit
- [x] `updateTokenPos` / `saveUnit` / `saveUnitText` / `removeUnit` / `saveLexeme` 成功后派发
- [x] `saveUnitsBatch` persist 后按 unique `unitId` 派发 `unit-updated`
- [x] `saveTokenLexemeLink` / `removeTokenLexemeLinks` / `removeTokenLexemeLinksByIds` persist 后派发 `unit-updated`（查 token/morpheme）与 `lexeme-updated`
- [x] `saveUserNote` 在 `targetType` 为 unit/token/morpheme 且能解析 `unitId` 时派发 `unit-updated`
- [x] 不改 ChatWindow；不新增 feature flag

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| Helper | `src/utils/workspaceEvents.ts` | 总线 + 去重决策 |
| Re-export | `src/utils/appShellEvents.ts` | 计划书锚点 |
| Service | unit/lexeme/note/cleanup 写路径 | persist 后 emit（含 batch unique unitId、token↔lexeme 链接） |
| Hook | `src/hooks/useWorkspaceEventRefresh.ts` | 订阅 |
| Controller | annotation / corpus | 增量 invalidate |
| 测试 | events + page | 去重 / 草稿 / 刷新 |

## 5. 已知风险与依赖

- 转写 `useTranscriptionUnitActions` 是 hotspot，emit 放 LinguisticService 写门。
- `lexeme-deleted` 仓内尚无删除 API，只提供类型与 dispatch。
- 回滚：停止 emit / 订阅即可，无 schema。
