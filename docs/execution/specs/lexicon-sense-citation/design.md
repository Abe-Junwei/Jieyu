---
title: lexicon-sense-citation design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-30
source_of_truth: lexicon-sense-citation-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon sense citation

## 1. 成熟方案扫描 / Research

- 仓库既有：标注页 `saveAnnotationOccurrenceCitation` 把 `textId`、`unitId`、`tokenId`、`lexemeId`、`senseId` 写在词条的 `jieyu.occurrenceCitations`。`occurrenceCitationStatus` 能判断链接是否还指向同一义项。手写例证在义项 `examples`。
- 同类产品：Plaid 和 CLDF 的例句指回语料里的那一次出现，不另存一份句子。
- 业内：例句引用和手写例证分开。打开时读当前转写和译文。
- 公认不可行：把句子正文再存进词条。改字后两份会分叉。
- 潜在的坑：编辑表单重建 `jieyu` 时如果只留下注释和例证参照，引用会被删掉。
- 决定：**复用**已有引用数组。保存词条时原样带上。展示时按单元现读。

## 2. 架构选择

- 落位：保存函数保留数组；词典义项列表现场读取。
- 拒绝：把句子写进 `examples`；为引用新增 Dexie 表。

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `dmlexEntry.ts` | 保存时留下引用 | 小改 |
| `loadOccurrenceCitationDisplays.ts` | 读转写和译文 | < 80 行 |
| `LexiconSenseCitations.tsx` | 展示失效和删除 | 组装 |

约束自查：无新表；无新边框；不把句子副本写入词条。

## 4. ADR 引用

- 不新建 ADR。

## 5. Feature flag

- 不新增 flag。

## 6. 失败模式 / 兼容性

- 单元已删时句子为空，引用标成失效，仍可删除。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| 单元测试 | `npx vitest run src/utils/dmlexEntry.test.ts src/pages/annotation/annotationOccurrenceCitation.test.ts` | all pass |
