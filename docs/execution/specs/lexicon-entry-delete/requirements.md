---
title: lexicon-entry-delete requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-19
source_of_truth: lexicon-entry-delete-spec
depends_on:
  - ../lexicon-entry-edit/requirements.md
  - ../workspace-cross-page-events/requirements.md
---

# Requirements — Lexicon Entry Delete (B3d)

## 1. What & Why

- **要做什么**：在 `/lexicon` 对选中词条做**确认后硬删除**，经 `LinguisticService.lexemes.delete` 去掉 `lexemes` 行、其 `token_lexeme_links` 与附件引用，再 `list()` readback 确认 id 不在；persist 后派发已有 `jieyu:workspace.lexeme-deleted.v1`。
- **为什么现在做**：B3b 能建/改，B2 已有 `lexeme-deleted` dispatch 但无生产者；M3 余量写明删除词条。
- **不做什么**：不做软删 / `dateDeleted` / 新 Dexie 版本；不做义项树、词条合并、LIFT 导入删条；不接 ChatWindow；不改附件 flag。

## 2. 用户场景（≤ 3 条）

1. 选中词条，点删除并确认，列表不再有该 id，reload 仍无。
2. 取消确认对话框：不写库。
3. 词条若有 token 链接或附件引用，删除后链接与未共享附件一并去掉。

## 3. 验收标准（可测）

- [x] write→`list()` 不含该 id
- [x] 取消确认零写入
- [x] 级联去掉 `token_lexeme_links`（`lexemeId`）与附件 link/GC
- [x] persist 后 `deletionMode: 'hard'` 事件；不改 `lexiconListState` 键名；无新 flag

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Service | `linguisticServiceLexemeOps.ts` + `LinguisticService.lexemes.delete` | 新增硬删除 |
| Helper | `src/pages/lexicon/deleteLexiconEntry.ts` | readback |
| Controller | `useLexiconEntryEditController.ts` | 确认/删除 |
| UI | `LexiconEntryEditForm.tsx` + `ConfirmDeleteDialog` | 装配 |
| i18n | dictKeys + zh-CN / en-US | 新键 |
| 测试 | `deleteLexiconEntry.test.ts` + `LexiconPage.test.tsx` | 新增用例 |

## 5. 已知风险与依赖

- B6 已对悬空 lexeme 报 `CITATION_LEXEME_NOT_FOUND`；本切片仍级联删链接，避免孤儿行。
- 不引入软删列（与 B6「无软删列」一致）。
- 面板已有 Shell + 详情边框：删除按钮不加第三层 border。
