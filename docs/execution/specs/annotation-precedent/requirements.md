---
title: annotation-precedent requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-30
source_of_truth: annotation-precedent-spec
depends_on:
  - ../../plans/转写标注词典联动需求-2026-09-29.md
---

# Requirements — Annotation same-form gloss

## 1. What & Why

- **要做什么**：空白词显示同形注释建议；回车才写入。用户可以把这条注释铺到其余空白同形词。
- **为什么现在做**：建议已经能按多数票出现，但还不区分已确认义项，铺开时也会碰到已有分析。
- **不做什么**：不把建议预先写入库；不复制词典链接；不把整词挂到词缀或附着词条；词和语素不混在同一次计数里。

## 2. 用户场景（≤ 3 条）

1. 空白词看到多数注释，回车后写入，并标成已确认。
2. 两种注释一样多时格子保持空白。
3. 「按这个注释其余同形」不改已有注释、链接、词性或已切开的词。

## 3. 验收标准（可测）

- [x] 已确认义项译文优先于语料注释；平局不给建议
- [x] `suggested` 不计入下一次建议
- [x] 回车写入后 `provenance.reviewStatus` 为 `confirmed`
- [x] 铺开只写空白同形词的注释，源词上的链接仍只在源词

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| 纯函数 | `annotationGlossSuggestion.ts` | 排序和空白词筛选 |
| 写路径 | `acceptAnnotationGlossSuggestion.ts`、`saveAnnotationGlossByForm.ts`、`updateTokenGloss` | 确认后写入 |
| 页面 | `AnnotationWorkspace.tsx`、`AnnotationIgtLineGrid.tsx` | 组装建议和按钮 |

## 5. 已知风险与依赖

- 字符变体比较沿用 `foldCharacterVariants`。不另写一套折叠。
- 铺开不调用链接保存。词缀限制因此不会被这次写入绕过。
