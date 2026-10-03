---
title: annotation-sentence-export requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-30
source_of_truth: annotation-sentence-export-spec
depends_on:
  - ../../plans/转写标注词典联动需求-2026-09-29.md
---

# Requirements — Annotation sentence export

## 1. What & Why

- **要做什么**：导出的一句带转写正文、选定译文、词和语素的 form / gloss / pos、`senseId`、说话人、起止时间、`unitId` 和媒体。
- **为什么现在做**：现在的句子导出还没有语素词类，也没有按 id 读回。
- **不做什么**：不改作者 gloss；不写回库；不靠列顺序对应 token 和义项。

## 2. 用户场景（≤ 3 条）

1. 导出后仍能用 `unitId` 和时间回到这句。
2. 词类在词上，语素词类在语素上，两者可以不同。
3. 把词和语素的顺序打乱再读回，对应关系不变。

## 3. 验收标准（可测）

- [x] 读回后 `unitId`、时间和 `senseId` 仍在原 token 上
- [x] 语素 `pos` 与整词 `pos` 分列，靠 `tokenId` 相连
- [x] 导出含 `mediaId`

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| 纯函数 | `annotationSentenceExport.ts` | 语素、媒体、按 id 读回 |
| 页面 | `AnnotationWorkspace.tsx` | 把语素放进导出 |

## 5. 已知风险与依赖

- 语素 `pos` 从已保存的 `unit_morphemes.pos` 读出，不从整词词类推导。
