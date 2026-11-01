---
title: P0a 改正文→待复核核验证据
doc_type: execution-plan
status: active
owner: repo
last_reviewed: 2026-11-01
source_of_truth: execution-plan
---

# P0a 核验证据（2026-11-01）

对照 [4ws 清单 P0a](./jieyu-4ws-impl-checklist-2026-10-31.md) 与 ADR-0088／0089。

## 代码合同

`updateUnitText`（`src/db/desktop/units.ts`）在同一事务内：若存在当前分析图 → `insertReviewSnapshot` → 改正文 → 清 `analysis_graph_json`／投影／关联 → 推进 `analysis_generation` 与文稿 `generation` → 读回校验。

## 自动化证据

```text
npx vitest run src/db/desktop/unitTextUndo.test.ts \
  src/db/desktop/analysisRestore.test.ts \
  src/db/desktop/analysisCandidates.test.ts
→ 3 files / 26 tests passed
```

关键断言（`analysisRestore.test.ts`）：

- 改正文后当前 `graph === null`，代际 +1
- 留下 `review-snapshot`，正文为改前句
- `openProject` 重开后：新正文在、图仍空、快照仍在

## 结论

P0a **持久化核验通过**；未发现需改库的失败用例。仍缺（P0b，不阻塞本核验）：读模型／状态展示／跨页失效刷新；用户木雅真机抽验另计。
