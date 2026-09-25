---
title: annotation-retokenize-force requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-25
source_of_truth: annotation-retokenize-force-spec
depends_on:
  - ../annotation-retokenize/requirements.md
---

# Requirements — Annotation Retokenize Force (B4g)

## 1. What & Why

- **要做什么**：已有人工标注的句段，在二次分词预览之后可以显式覆盖词列，并在覆盖前留下可恢复的快照。
- **为什么现在做**：ADR-0022 要求覆盖人工结果走强制模式并带快照与回滚点。B4f 只写 pending candidate。
- **不做什么**：不静默覆盖；不覆盖未保存的 token 草稿；不改转写文本/时间码；不接 ChatWindow；不新 flag；不新 Dexie 版本；不做更完整的 Validator 面板。

## 2. 用户场景（≤ 3 条）

1. 句段已有 gloss 时，确认二次分词仍不改词列，并出现「覆盖分词」。
2. 覆盖后词列变成建议切分，gloss / 词素 / 词典链接先被卸下；点「恢复分词」后这些内容按原 id 回来。
3. 有未保存的 token 草稿时，覆盖不写库。

## 3. 验收标准（可测）

- [x] 无强制标记时，有 gloss 的确认仍只写 pending candidate
- [x] `mode: 'force'` 先写快照再替换 `unit_tokens`，readback 等于建议词列
- [x] 恢复后 gloss、词素、链接与 token id 回来，快照不再 pending
- [x] 脏草稿的 force 不删 token、不写快照

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Helper | `annotationRetokenize.ts` | 强制覆盖与恢复 |
| Controller / UI | retokenize controller + IGT extras | 覆盖 / 恢复按钮 |
| 测试 | `annotationRetokenize.test.ts` | 新增 |
