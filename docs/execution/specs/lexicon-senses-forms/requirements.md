---
title: lexicon-senses-forms requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-19
source_of_truth: lexicon-senses-forms-spec
depends_on:
  - ../lexicon-entry-edit/requirements.md
---

# Requirements — Lexicon Senses & Forms (B3c)

## 1. What & Why

- **要做什么**：在 `/lexicon` 词条编辑里维护**额外义项**（gloss + 可选 definition）和**词形**（transcription），经既有 `saveLexeme` 写 `lexemes.senses` / `forms` 后 list readback。
- **为什么现在做**：B3b 只编 lemma / 主 gloss；页面只读已能列出多义项与词形，但无法写入。M3 余量是多义项 / 词形表。
- **不做什么**：不做义项树 / subsense / 词类 category 编辑 / 删除词条；不做 FLEx allomorph environment、variant-entry 关系；不接 ChatWindow；不改附件 flag；不新 Dexie 版本；不从 `/corpus` 导出词典包。

## 2. 用户场景（≤ 3 条）

1. 选中词条，追加第二条义项 gloss，保存后详情义项列表与 reload 都出现该 gloss。
2. 追加或改写词形 transcription，保存后 `forms` readback 等于非空词形列。
3. 额外义项 gloss 为空则丢弃该行；全部词形为空则去掉 `forms` 字段。主 gloss 仍走 B3b 第一条 sense。

## 3. 验收标准（可测）

- [x] 追加 extra sense：write→list() 该 id 的 `senses[1].gloss` 一致
- [x] 写入 forms：readback transcription 列等于非空输入
- [x] 空 extra gloss / 空 form 不落库；主 sense[0] 仍保留
- [x] 不改 `lexiconListState` 键名；无新 flag

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Helper | `src/pages/lexicon/saveLexiconEntry.ts` | 扩展 fields + apply |
| Controller | `src/pages/useLexiconEntryEditController.ts` | 增删行 |
| UI | `LexiconEntryEditForm.tsx` | 义项/词形列表 |
| i18n | dictKeys + zh-CN / en-US | 新键 |
| 测试 | `saveLexiconEntry.test.ts` + `LexiconPage.test.tsx` | 新增用例 |

## 5. 已知风险与依赖

- `LexemeDocType.senses` / `forms` 已存在，禁止新表。
- 控制器已有 create/save 竞态处理：只扩 fields，不新开 mega-hook。
- 面板已有 Shell + 详情区边框：义项行禁止再加 `border`。
