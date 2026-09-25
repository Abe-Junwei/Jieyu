---
title: lexicon-sense-tree requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-22
source_of_truth: lexicon-sense-tree-spec
depends_on:
  - ../lexicon-senses-forms/requirements.md
  - ../lexicon-lift-import/requirements.md
---

# Requirements — Lexicon Sense Tree

## 1. What & Why

- **要做什么**：`/lexicon` 义项可挂一层或多层子义项（`parentId`），保存后 `list()` readback；LIFT 0.13 用 `<subsense>` 往返。
- **为什么现在做**：M3 在 B3f 之后只剩义项树；B3c 仍是扁平 `senses[]`。
- **不做什么**：无限拖拽排序；DMLex；跨条 variant-entry；附件包；FLEx 三档冲突 UI；ChatWindow；新 flag；不改 R8 键。

## 2. 用户场景（≤ 3 条）

1. 在主 gloss 下添加子义项，保存后详情列表缩进显示，readback 带 `parentId`。
2. 删除父义项时子义项一并去掉。
3. 导出/导入 LIFT：子义项在父 `<sense>` 内为 `<subsense>`，id 与 gloss 往返。

## 3. 验收标准（可测）

- [x] `applyLexiconEntryFields` 写入 `parentId`；无 parent 的额外义项仍是根
- [x] `saveLexeme` → `list()` readback 保留 parent 链
- [x] 删父义项后子行不残留
- [x] serialize/parse LIFT：`<subsense>` 嵌套；无 parentId 时仍扁平 `<sense>`
- [x] 无新 flag；ChatWindow 零 diff

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Helper | `src/utils/lexemeSenseTree.ts` | 新增 depth / 子树 / LIFT 分组 |
| Helper | `saveLexiconEntry.ts` + LIFT import/export | 修改 |
| Controller / form | `useLexiconEntryEditController` + `LexiconEntryEditForm` | 添加子义项 |
| Schema | `src/db/types.ts` + `schemas.ts` | 可选 `parentId` |
| 页面 | `LexiconPage.tsx` | 详情缩进 |
| 测试 | save / lift / LexiconPage | 新增 |

## 5. 已知风险与依赖

- LIFT RNG 用 `subsense` 不是嵌套 `sense`；入站只认 `subsense`。
- 环状 `parentId` 当根处理，不写库纠正以外的自动修复。
- 无 Dexie 新版本：`passthrough` 已允许未知字段。
