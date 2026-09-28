---
title: lexicon-sense-semantic-domains requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-semantic-domains-spec
depends_on:
  - ../lexicon-sense-grammar-note/requirements.md
---

# Requirements — Lexicon Sense Semantic Domains

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项语义域（每个义项若干条文本，一行一条），保存后义项列表 readback，并随 LIFT 0.13 义项 `<trait name="semantic-domain-ddp4">` 进出。
- **为什么现在做**：语法注释之后，FLEx 义项上还没接的下一条是语义域。路线图数据模型里的 `semanticDomains` 按 FLEx 交换格式落在义项，不落在词条。
- **不做什么**：语义域浏览；封闭领域词表；词条级同名 trait；人类学范畴 `anthro-code`；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `1.1 Sky` 和 `1.2 World` 两行，保存后该义项能看到这两条，语法注释还在。
2. 清空后再保存，义项上不再有 `semanticDomains`。
3. 导入一份带义项语义域的 LIFT，保留该义项上每条非空、不重复的 trait 值及其顺序；词条级同名 trait 和其他 trait 名不写入。再次导入时若义项不再带这些 trait，语义域随整段 `senses` 被替换掉，语法注释仍按同一规则重读。

## 3. 验收标准（可测）

- [x] 语义域 write→义项列表 readback，语法注释仍在
- [x] 空白、空行和重复行省略或合并，空结果省略 `semanticDomains`
- [x] LIFT 义项 `trait name="semantic-domain-ddp4"` 往返，出站排在语法注释之后、子义项之前
- [x] 词条级同名 trait 和其他 trait 名不写入；再次导入省略这些 trait 时语义域随 `senses` 整段替换而消失
- [x] 无新 flag、无新表、无封闭词表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `semanticDomains` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<trait name="semantic-domain-ddp4">` |
| Form / list | 编辑表单 / `LexiconPage` 义项列表 | 输入与 readback |
