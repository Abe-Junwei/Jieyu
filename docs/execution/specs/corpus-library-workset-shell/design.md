---
title: corpus-library-workset-shell design
doc_type: execution-spec-design
status: active
owner: corpus
last_reviewed: 2026-09-04
source_of_truth: corpus-library-workset-shell-spec
depends_on:
  - ./requirements.md
  - ../../plans/语料库页面开发路线图-2026-04-22.md
  - ../../plans/解语-主路线图-master-roadmap-2026-06-01.md
---

# Design — Corpus Library Workset Shell (B5a-1)

## 1. 成熟方案扫描 / Research

- 仓库既有：`/analysis` 独立 controller + `LinguisticService.units.listByTextId`；词典 `lexiconListState` sessionStorage；语料路线图已拍板 `corpusBasket` 与转写选择隔离、仅 Router 会话、换媒体/项目清空。
- 同类产品：AntConc 左侧目标语料文件列表 + 检索，无与编辑器共享的 selection；FLEx Concordance 结果集与 Texts 编辑区分开，出站靠复制/导出（B5b）。
- 业内：concordance/workset 与 editor selection 隔离，避免双轨漂移。
- 公认不可行：把语料多选镜像 `selectedUnitIds`；basket 双写 URL+sessionStorage；在语料页写转写真源；复用 `SavedCorpusSourceSet`（那是 AI 来源集）。
- 潜在的坑：ChatWindow hotspot 96%，本切片零触及；`SidePaneSidebarSegmentList` 绑转写侧栏，不复用。
- 决定：**适配** 分析页只读范围 + 语料路线图 basket 合同；**复用** `listByTextId` 与深链；**自研** 内存会话 store（符合「不落 URL/Dexie」）。

## 2. 架构选择

- 落位：`state`（basket 会话）+ `derived`（过滤行）+ 页面组装
- 方案 A：内存会话 basket + 当前 text/media 只读列表 — **选 A**
- 拒绝：Dexie 工作集表（与拍板存储口径冲突）；项目级新索引（B5a-2）

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `corpusBasketSession.ts` | 会话工作集 + 换范围清空 | < 80 |
| `corpusViewState.ts` | sessionStorage 筛选 | < 50 |
| `useCorpusLibraryController.ts` | 读列表 / toggle / 深链 | < 180 / < 10 hooks |
| `CorpusLibraryWorkspace.tsx` | 纯渲染 | < 150 |
| `CorpusLibraryPage.tsx` | flag 装配 | < 40 |

约束自查：无 ChatWindow；无第 3 层 border；不引入 `src/features/`。

## 4. ADR 引用

- ADR-0020 转写轨读：本页不按轨写库
- 新建 ADR：否

## 5. Feature flag

- `corpusLibraryPageEnabled` / `VITE_CORPUS_LIBRARY_PAGE_ENABLED`
- 默认 `false`（全部环境）

## 6. 失败模式 / 兼容性

- flag 关：占位页与现网一致
- 无 text 范围：空态，引导回转写
- 回滚：关 flag

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/pages/corpusBasketSession.test.ts src/pages/CorpusLibraryPage.test.tsx src/pages/FeatureAvailabilityPage.layoutGuard.test.ts src/ai/config/featureFlags.environmentMatrix.test.ts` | pass |
| 守卫 | architecture-guard / docs | OK |
