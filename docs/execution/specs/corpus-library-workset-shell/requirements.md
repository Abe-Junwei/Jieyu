---
title: corpus-library-workset-shell requirements
doc_type: execution-spec-requirements
status: active
owner: corpus
last_reviewed: 2026-09-04
source_of_truth: corpus-library-workset-shell-spec
---

# Requirements — Corpus Library Workset Shell (B5a-1)

## 1. What & Why

- **要做什么**：打开 `/corpus` 的只读列表 + 多选工作集壳（与转写 `selectedUnitIds` 隔离）。flag 关时仍是占位页。
- **为什么现在做**：B15 / B11 安全轨已收口；B5b 出站阻塞于本页工作集。
- **不做什么**：不写 `layer_units` / `unit_tokens`；不做剪贴板出站（B5b）；不接 AI / ChatWindow；不建项目级索引表（MVP-B 全量留给后续）；不把 `corpusBasket` 写入 URL / Dexie / `sessionStorage`。

## 2. 用户场景（≤ 3 条）

1. Flag 关：`/corpus` 仍是 `FeatureAvailabilityPanel`。
2. Flag 开：用户在当前 text/media 范围多选句段，工作集与转写选择互不干扰；换 media/text 时工作集清空。
3. 筛选框写入 `corpusViewState`（sessionStorage）；从语料行可深链回转写。

## 3. 验收标准（可测）

- [x] `corpusLibraryPageEnabled` 默认 `false`
- [ ] flag 关 DOM 仍为占位面板
- [ ] 工作集 toggle → 同会话 readback；换 media/text 清空
- [ ] `corpusViewState` 仅存筛选；basket 不进 URL / Dexie
- [x] 不改 ChatWindow；`check:architecture-guard` 无新增 hotspot

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| 页面 | `CorpusLibraryPage.tsx` | flag 装配 |
| Controller | `useCorpusLibraryController.ts` | 只读列表 + basket |
| Helper | `corpusBasketSession.ts` | Router 会话工作集 |
| UI | `CorpusLibraryWorkspace.tsx` | 壳层渲染 |
| Flag / i18n | `featureFlags.ts` / `dictKeys` | 新增 |

## 5. 已知风险与依赖

- 读模型本切片用当前 text/media（与分析页同源），不是跨媒体索引。
- 回滚：关 flag。
