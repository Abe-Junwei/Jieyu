---
title: corpus-analysis-query-tools design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: corpus-analysis-query-tools-spec
depends_on:
  - ./requirements.md
---

# Design — corpus-analysis-query-tools

## 1. 成熟方案扫描 / Research

- 仓库既有最相似的模式：`search_units` 与 `get_unit_linguistic_memory` 走 `localContextTools`，效果为 read，结果带 `_readModel`。
- 同类产品：Elicit 先把文献抽成带出处的表，再写报告。共现和范式在语言学软件（ELAN、FLEx）里是对标注库的查询，不是模型生成。
- 业内做法：KWIC 是按目标词对齐的左右上下文行，每行能回到原句。
- 不可行：让模型自己数次数。OpenScholar 记录不检索时引用会大面积编造。
- 坑：整库按 `textId` 读语素，大项目会慢。本片先全量读当前文稿，不建新索引。
- 决定：复用现有本地工具通道，查询本身是纯函数。flag 默认关。

## 2. 架构选择

- 落位：纯函数计算，执行器只负责读 Dexie。
- 选纯函数而不是在执行器里写规则，因为验收不需要模型，测试用夹具即可。
- 范围是 `shortTerm.workspaceTextId` 对应的当前文稿。

## 3. 验证

- `npx vitest run src/ai/analysis/corpusAnalysisQueries.test.ts src/ai/policy/localContextToolEffects.test.ts`
- `npm run typecheck`
