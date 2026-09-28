---
title: lexicon-sense-dialect-labels requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-dialect-labels-spec
depends_on:
  - ../lexicon-sense-status/requirements.md
---

# Requirements — Lexicon Sense Dialect Labels

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项方言标签（每个义项多条文本），保存后义项列表 readback，并随 LIFT 0.13 义项 `<trait name="dialect-labels">` 进出。
- **为什么现在做**：FLEx 义项上仍缺的简单 trait 是 Dialect Labels。状态已经落地。
- **不做什么**：封闭方言词表；词条级 dialect-labels；义项状态；词汇关系；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `northern` 和 `southern`，保存后该义项能看到这两条，义项状态还在。
2. 清空后再保存，义项上不再有 `dialectLabels`。
3. 导入一份带义项 `dialect-labels` 的 LIFT，只留下该义项的非空值，去重并保持顺序。词条级同名 trait 和 status trait 不写入方言标签。再次导入时若义项不再带这些 trait，方言标签随整段 `senses` 被替换掉，义项状态仍按同一规则重读。

## 3. 验收标准（可测）

- [x] 方言标签 write→义项列表 readback，义项状态仍在
- [x] 空白和重复省略；空列表省略 `dialectLabels`
- [x] LIFT 义项 `trait name="dialect-labels"` 往返，排在义项状态之后、子义项之前
- [x] 词条级同名 trait 和其他 trait 名不写入；再次导入省略这些 trait 时方言标签随 `senses` 整段替换而消失
- [x] 无新 flag、无新表、无封闭词表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `dialectLabels` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<trait name="dialect-labels">` |
| Form / list | 编辑表单 / `LexiconExtraSenseEditor` / `LexiconSenseList` | 多行输入与 readback |
