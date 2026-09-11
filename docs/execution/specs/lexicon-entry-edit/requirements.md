---
title: lexicon-entry-edit requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-11
source_of_truth: lexicon-entry-edit-spec
depends_on:
  - ../lexicon-attachments/requirements.md
  - ../annotation-morpheme-edit/requirements.md
---

# Requirements — Lexicon Entry Edit (B3b)

## 1. What & Why

- **要做什么**：在 `/lexicon` 详情里编辑（及新建）词条 lemma / 主 gloss / citation / language / notes，经 `LinguisticService.lexemes.save` 写 Dexie 后 reload→readback。
- **为什么现在做**：标注页已能链到词条，但词典页仍只读；`saveLexeme` 页面零调用，转写→标注→词典闭环缺这一步。
- **不做什么**：不接 ChatWindow；不改 R8 `lexiconListState` 键分轨；不做多义项树 / 词形表 / 删除；不改附件 flag；不从 `/corpus` 导出词典包；不引入 LIFT 编辑器。

## 2. 用户场景（≤ 3 条）

1. 选中词条，改 lemma 与主 gloss，保存后列表与详情立刻显示新值，reload 仍在。
2. 点「新建词条」，填 lemma（必填）与 gloss，保存后该条出现在列表并被选中。
3. lemma 为空时不写库。

## 3. 验收标准（可测）

- [ ] 编辑现有词条：write→list() find id→lemma/gloss 一致
- [ ] 新建词条：`senses` 至少 1 条；保存后 `list()` 含新 id
- [ ] 空 lemma 拒绝写入
- [ ] 不改 `lexiconListState` 的 search/selected/scroll 键名

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Helper | `src/pages/lexicon/saveLexiconEntry.ts` | 新增 patch + 写+readback |
| Controller | `src/pages/useLexiconEntryEditController.ts` | 新增 |
| UI | `src/pages/lexicon/LexiconEntryEditForm.tsx` | 新增；页面只装配 |
| Service | `linguisticServiceLexemeOps.saveLexeme` | 保持 put；补 readback 测试 |
| i18n | dictKeys + zh-CN / en-US | 新键 |
| 测试 | `saveLexiconEntry.test.ts` + `LexiconPage.test.tsx` | 新增 / 修改 |

## 5. 已知风险与依赖

- `saveLexeme` 的 adapter `insert` 已是 Dexie `put`，可覆盖同 id。
- `LexiconPage` 已偏长：禁止把写库细节堆进页面。
- 主 gloss 写入优先 `default`，否则改现有第一个键，避免 `eng`+`default` 双值并列。
