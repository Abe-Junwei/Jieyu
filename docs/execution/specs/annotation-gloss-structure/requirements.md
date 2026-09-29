---
title: annotation-gloss-structure requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-29
source_of_truth: annotation-gloss-structure-spec
depends_on:
  - ../../../adr/0022-annotation-analysis-graph-typed-relations.md
---

# Requirements — Annotation gloss structure

## 1. What & Why

- **要做什么**：把每个词的 Leipzig 注释解析进整句分析图。
- **为什么现在做**：结构解析已经能认出边界，但整句投影仍把整段注释挂在一个 gloss 上。
- **不做什么**：改单 token 的结构配置投影；改写作者注释；猜测表面字符偏移；重叠、异干、任意图编辑。

## 2. 用户场景（≤ 3 条）

1. 词注释含 `=` 时，聚焦行能看到附缀指向宿主，注释原文仍在。
2. `∅`、`[]` 成为零形式；`.` 后的特征留在同一节点；`\` 只出现在需复核里。
3. `<...>` 记为中缀，并标明表面偏移不在注释里。已有两段 surface 的词素仍是非连续成分。

## 3. 验收标准（可测）

- [x] `1SG=COP` 生成 `cliticizesTo`，标签保持 `1SG` 与 `COP`
- [x] `sheep-∅.PL` 有零形式节点，`PL` 不是另一个词素，特征为 `Number=Plur`
- [x] `touch<PRS>` 有中缀和 `discontinuousPartOf`，并有降级诊断
- [x] `sheep-[]` 生成零形式；`go\went` 有需复核且没有 process 节点
- [x] 两段 surfaceParts 的词素生成 `discontinuousPartOf`
- [x] `projectStructuralParseToAnalysisGraph` 仍以 `token-1` 为入口

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| 纯函数 | `src/annotation/glossStructure.ts` | 新增 |
| 投影 | `src/annotation/projectUtteranceAnalysisGraph.ts` | 调用 |
| 行 | `src/pages/annotation/AnnotationIgtRow.tsx` | 聚焦行读当前投影 |
| 测试 | `src/annotation/glossStructure.test.ts` | 新增 |

## 5. 已知风险与依赖

- 注释里的 `1SG` 不会还原成表面词 `I`。表面偏移只来自词素上已有的 `surfaceParts`。
- 词上已经有人工词素时，不再从整词注释另造一套词素。
