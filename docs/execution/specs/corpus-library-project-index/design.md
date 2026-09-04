---
title: corpus-library-project-index design
doc_type: execution-spec-design
status: active
owner: corpus
last_reviewed: 2026-09-04
source_of_truth: corpus-library-project-index-spec
depends_on:
  - ./requirements.md
  - ../corpus-library-workset-shell/design.md
  - ../../plans/语料库页面开发路线图-2026-04-22.md
---

# Design — Corpus Library Project Index (B5a-2)

## 1. 成熟方案扫描 / Research

- 仓库既有：`getUnitsByTextId` 已按 `textId` 滤 canonical `layer_units`（含全部 media）；B5a-1 再按 `mediaId` 窄化。无 `projects` 表，`LinguisticService.projects.create` 写入 `texts`，**项目 ≈ 一条 text**。页面不得 import `../services`。
- 同类产品：ELAN Structured Search 在已选 EAF 域上查询，不另建与 annotation 文件分叉的索引副本；FLEx Concordance 扫 Texts 集合；AntConc 以加载文件为 corpus，无第二份写时同步的 unit 表。
- 业内：时间对齐语料的「索引」优先是 **查询投影**；独立 FTS/倒排在规模或正则热路径可复现变慢后再上（路线图 P2+ Spike：SQLite-WASM+FTS5 / Tantivy WASM）。
- 公认不可行：Dexie `corpus_unit_index` 与 `layer_units` 双写（version bump、漏同步幽灵行）；`getAllUnits()` 当首屏（跨 text 全库）；把 basket 仍绑 `mediaId`（跨媒体工作集会被自己清掉）。
- 潜在的坑：§5.3「换媒体清空」是 MVP-A 口径；重建=react-query 再拉 canonical，无物化缓存。ChatWindow hotspot 零触及。
- 决定：**适配** canonical `listUnitDocsFromCanonicalLayerUnits`；**自研** 纯函数投影+排序（`corpusUnitIndexQuery`）；**拒绝** 本切片物化表与 FTS。

## 2. 架构选择

- 落位：`derived`（投影/排序/行）+ `state`（basket 改 text 作用域）
- 方案 A：查询层包装 `getUnitsByTextId` — **选 A**
- 拒绝：新 Dexie 表；SQLite-WASM；分页 UI

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `corpusUnitIndexQuery.ts` | 投影 + 稳定排序 + list | < 80 |
| `LinguisticService.ts` | `units.listCorpusIndexByTextId` | +1 接线 |
| `corpusBasketSession.ts` | `{ textId, unitIds }` | < 50 |
| `useCorpusLibraryController.ts` | 换 API、去掉 media 滤列表 | 仍 < 220 / < 12 hooks |
| `CorpusLibraryWorkspace.tsx` / CSS | 行上 `mediaId`；无第 3 层 border | +20 |

约束自查：无 ChatWindow；无 `src/features/`；面板最多 2 层 border。

## 4. ADR 引用

- ADR-0020：本页不按轨写库
- 新建 ADR：否（查询层可逆，非持久化技术选型）

## 5. Feature flag

- 沿用 `corpusLibraryPageEnabled`（默认 `false`）；不新增第二开关

## 6. 失败模式 / 兼容性

- flag 关：占位页
- 无 textId：空态
- 回滚：关 flag；basket 作用域变更无持久化

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/services/corpusUnitIndexQuery.test.ts src/pages/corpusBasketSession.test.ts src/pages/CorpusLibraryPage.test.tsx src/pages/corpusWorksetExport.test.ts src/pages/FeatureAvailabilityPage.layoutGuard.test.ts` | pass |
| 守卫 | architecture-guard / docs / workflow | OK |
