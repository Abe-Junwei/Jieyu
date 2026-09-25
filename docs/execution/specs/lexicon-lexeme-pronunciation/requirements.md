---
title: lexicon-lexeme-pronunciation requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-pronunciation-spec
depends_on:
  - ../lexicon-sense-examples/requirements.md
---

# Requirements — Lexicon Entry Pronunciation

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑词条发音（一条文本），保存后概览 readback，并随 LIFT 0.13 `<pronunciation>` 进出。
- **为什么现在做**：LIFT 词条级 `<pronunciation><form><text>` 是 FLEx 在例证之后的下一栏；表单和出站/入站都还没带它。
- **不做什么**：媒体、声调、CV 模式、location；第二条发音；按义项发音；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 在词条上写下 `dɔg`，保存后概览能看到这串发音。
2. 清空发音再保存，词条上不再有 `pronunciation`。
3. 导入一份带 `<pronunciation>` 的 LIFT，只留下第一个有文本的 form；没有该元素时，已有发音还在。

## 3. 验收标准（可测）

- [x] 发音 write→概览 readback
- [x] 空白省略 `pronunciation`
- [x] LIFT `<pronunciation>` 往返第一条 form 文本，出站 lang 为 `und-fonipa`
- [x] 入站跳过只有媒体的块；省略元素时保留已有发音
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略 `pronunciation` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | `<pronunciation>` |
| Controller / form / page | 既有编辑表单与概览 | 输入与 readback |
| 测试 | save / LexiconPage / LIFT | 新增 |
