---
title: annotation-token-detach requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-30
source_of_truth: annotation-token-detach-spec
depends_on:
  - ../../plans/转写标注词典联动需求-2026-09-29.md
---

# Requirements — Annotation token detach

## 1. What & Why

- **要做什么**：删除带语素或词典链接的词之前，挂到旁边的词上；只剩一个词时先写明将失去的条数。改一种转写语言时留下其他语言。
- **为什么现在做**：合并已经搬走附着分析，单独删除仍会直接清掉语素和链接。
- **不做什么**：不新做快照表；不改合并和强制重切分已有的搬走逻辑。

## 2. 用户场景（≤ 3 条）

1. 删除右词后，它的语素和链接在左词上，`senseId` 和 confidence 还在。
2. 句中只剩一个带分析的词时，菜单写明将失去的条数，确认后才删。
3. 只改一种转写语言后，另一种语言的正文还在。

## 3. 验收标准（可测）

- [x] 删右词后语素和链接的 id 仍在，宿主是左词
- [x] 未确认时单独的词还在；确认后词和语素都消失
- [x] `transcriptionMapWithSurface` 只替换被编辑的语言键

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| 写路径 | `deleteAnnotationToken.ts` | 新增 |
| 菜单 | `annotationIgtMenus.ts`、`AnnotationIgtRow.tsx` | 删除项 |
| 页面 | `AnnotationWorkspace.tsx` | 组装 |

## 5. 已知风险与依赖

- 语素多语言表沿用 `saveAnnotationMorphemes` 的整表复制，本片删除不重写 gloss。
- 没有邻居时不静默删除。
