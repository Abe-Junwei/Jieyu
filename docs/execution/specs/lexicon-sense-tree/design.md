---
title: lexicon-sense-tree design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-22
source_of_truth: lexicon-sense-tree-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Tree

## 1. 成熟方案扫描 / Research

- 仓库既有：B3c 扁平 `senses[]` + nested `id`（`saveLexiconEntry` / `ensureLexemeNestedIds`）；B3e/B3f 把每个 sense 写成 entry 下平铺 `<sense>`。
- 同类产品：FLEx / WeSay 义项可任意层嵌套；LIFT 交换用 **`<subsense>`**（[FLEx LIFT notes](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)；lift-0.13.rng `element name="subsense"`）。TLex 也是父义项下挂子义项，不是另开表。
- 业内：LIFT 0.13 仍是 FLEx/WeSay 真源（0.15 未普及）。权威实现 .NET LiftIO。浏览器无维护中的 0.13 tree mapper。
- 公认不可行：nested `senses` 数组改 schema（会打爆 B3c 下标/id 对齐）；用 relation 表模拟树；从 `/corpus` 编辑义项；npm 拉未维护 lift 包。
- 潜在的坑：RNG 禁止同一 parent 重复 lang；环状 parentId；导出若仍平铺 sense，FLEx 会当成兄弟义项。
- 决定：**适配** LIFT `subsense` + 在现有 `senses[]` 上加可选 `parentId`（邻接表）；**复用** B3c save/id；**自研** 纯函数树工具。无新依赖、无新 flag、无新 Dexie 版本。

## 2. 架构选择

- 落位：`derived`（depth / LIFT 分组）+ `actions`（save parentId）
- 选 A：邻接表 `parentId` 留在 document JSON
- 拒绝：嵌套 `senses: Sense[]` 改形状；新 controller；新表

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `src/utils/lexemeSenseTree.ts` | parentId / depth / 子树 / roots | < 80 |
| `saveLexiconEntry.ts` | 草稿带 parentId | 增量 |
| `lexiconLiftExport.ts` / `Import.ts` | sense↔subsense | 增量 |
| `useLexiconEntryEditController` + form | 添加子义项 | +1 回调，无新 hook |
| `LexiconPage.tsx` | 详情 `data-depth` | 装配 |

约束自查：无 `src/features/`；无第三层 border（缩进用 padding）。

## 4. ADR 引用

- 无新 ADR。词库仍不同步协作（ADR-0034）。

## 5. Feature flag

- 无。与 B3c / B3f 相同。

## 6. 失败模式 / 兼容性

- 旧行无 `parentId` = 全是根义项；LIFT 仍平铺 `<sense>`。
- 回滚：revert；库内 `parentId` 可忽略。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元 | `npx vitest run src/utils/lexemeSenseTree.test.ts src/pages/lexicon/saveLexiconEntry.test.ts src/utils/lexiconLiftExport.test.ts src/utils/lexiconLiftImport.test.ts src/pages/LexiconPage.test.tsx` | pass |
| 守卫 | architecture-guard / docs / visual-css | OK |
