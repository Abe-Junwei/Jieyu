---
title: corpus-library-project-index requirements
doc_type: execution-spec-requirements
status: active
owner: corpus
last_reviewed: 2026-09-04
source_of_truth: corpus-library-project-index-spec
---

# Requirements — Corpus Library Project Index (B5a-2)

## 1. What & Why

- **要做什么**：把 `/corpus` 只读列表从「当前 media」扩成当前 **text（项目）下全部媒体** 的查询层投影；工作集随 text 切换清空，换 media 保留。
- **为什么现在做**：B5a-1 仍是分析页同款 media 窄化；MVP-B 要求跨媒体索引，B5b 出站才能带走多 media 工作集。
- **不做什么**：不新建 Dexie `corpus_unit_index` 表 / schema bump；不上 SQLite-WASM/FTS；不做分页 UI；不扫全工作区 `getAllUnits()`；不写 `layer_units` / `unit_tokens`；不接 AI / ChatWindow；不把 basket 写入 URL / Dexie / `sessionStorage`。

## 2. 用户场景（≤ 3 条）

1. Flag 开、带 `textId`：列表含该 text 下所有 media 的句段，行上可见 `mediaId`。
2. 已选句段后改 URL `mediaId`：工作集仍在；改 `textId`：工作集清空。
3. 复制工作集：混合 media 时每条仍带自身 `mediaId` 与转写深链。

## 3. 验收标准（可测）

- [x] `listCorpusIndexByTextId` 投影稳定排序 `mediaId, startTime, unitId`
- [x] 两 media 的句段同时出现在列表；不再按当前 `mediaId` 丢行
- [x] 换 media 保留 basket；换 text 清空
- [x] 无 `textId` 时仍空态；flag 关仍占位
- [x] 不改 ChatWindow；`corpusLibraryPageEnabled` 默认 `false`

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| Service | `src/services/corpusUnitIndexQuery.ts` | 新增查询层 |
| Facade | `LinguisticService.units.listCorpusIndexByTextId` | 接线 |
| Helper | `corpusBasketSession.ts` | 作用域改为 `textId` |
| Controller / UI | `useCorpusLibraryController.ts` / Workspace | 全媒体列表 + 行 meta |
| Export | `corpusWorksetExport.ts` | 混合 media 头字段 |
| i18n / docs | `dictKeys` / 路线图 / 代码地图 | 合同更新 |

## 5. 已知风险与依赖

- 路线图 §5.3 原「换媒体清空」在 MVP-B 下改为「media 是视图提示，basket 按 text」。
- Controller 已近 10 hooks，本切片不加 hook。
- 回滚：关 `corpusLibraryPageEnabled`。
