---
title: 代码治理计划（修订版 v2）
doc_type: architecture-governance-plan
status: active
owner: repo
last_reviewed: 2026-10-14
source_of_truth: code-governance-plan-2026-05-06-v2
---

# 代码治理计划

已经做完的波次不是待办。热点以当次 `npm run check:architecture-guard` 为准。本文不记行数。

## 落位

- 新 hook 放进域子目录。`src/hooks/` 根上只留 `useAiChat.ts` 和 `useTranscriptionData.ts`。不要建 `src/hooks/index.ts` 全量 barrel。域内 `index.ts` 只再导出该域。
- 页面 controller 放在 `src/pages/`。领域写路径放在 `src/services/`。
- `LinguisticService.ts` 保持薄委托。语言目录的动态 import 仍指向 `src/services/languageCatalog/languageCatalogCore.ts`。
- `src/db/types.ts` 和 `src/db/schemas.ts` 仍是单体文件。外迁按域分批，每批留下兼容导出，并用 `npm run typecheck` 与相关 Dexie 测试收口。

## 门禁

- 先改 `scripts/architecture-guard/` 里的规则，再搬文件。路径对不上会报 Missing guarded file。
- 合并前跑完整的 `npm run check:architecture-guard`。命名 page controller 接近上限时，先按职责拆，再考虑调高 ratchet。
- 循环依赖：`npm run check:madge-circular`。
- 行数报告用 `npm run report:code-scale`。归档默认不进 git。不要把输出抄回本文。
