---
title: annotation-m1-open requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-11
source_of_truth: annotation-m1-open-spec
depends_on:
  - ../annotation-morpheme-edit/requirements.md
---

# Requirements — Annotation M1 Open (B4c / B4d / B4e)

## 1. What & Why

- **要做什么**：把 `/annotation` 做成可开放工作台：行内段播放、句段备注/标签/自我确信度、AutoGloss 预览后确认写入，并默认打开 `annotationPageEnabled`。
- **为什么现在做**：B4a/B4b 已提供 IGT 写链；用户目标是标注页能开放，而不是再停在 flag 关壳层。
- **不做什么**：不改转写文本/时间码；不做二次自动分词（B4f）；不接 ChatWindow / `annotationAdapters` / `useTranscriptionWaveformBridgeController`；不新建 Dexie 表；不把 `AutoGlossService.glossUnit` 当 preview；不改语料/MCP/词典附件 flag。

## 2. 用户场景（≤ 3 条）

1. 行聚焦按 Space 播放当前句段 `[startTime, endTime]`，再按暂停；输入框内 Space 仍插入空格。无媒体时不抛错。
2. 在当前句段写备注（`user_notes`）、选分类标签、改 `selfCertainty`；reload 后读回。
3. 对无 gloss 且无脏草稿的 token 预览词典匹配，确认后才写 `unit_tokens.gloss` 与 `token_lexeme_links`。

## 3. 验收标准（可测）

- [x] Space 行聚焦触发真实 play/pause；输入态仍为 `insertSpace`
- [x] 备注与 selfCertainty 写→reload→readback；标签走 `UserNoteDocType.category`
- [x] AutoGloss preview 零写入；采纳后 token/link readback 一致
- [x] `annotationPageEnabled` 默认 `true`；`VITE_ANNOTATION_PAGE_ENABLED=false` 仍显示占位面板

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| Controller | `useAnnotationSegmentPlaybackController.ts` / `useAnnotationUnitMetaController.ts` / `useAnnotationAutoGlossController.ts` | 新增 |
| Helper | `pages/annotation/playAnnotationUnitRange.ts` / `saveAnnotationUnitMeta.ts` / `applyAnnotationAutoGloss.ts` | 新增 |
| AI | `src/ai/autoGlossPreview.ts` | 抽出只读匹配 |
| UI / i18n | `AnnotationWorkspace` / `AnnotationIgtRow` / dict | 装配 |
| Flag | `featureFlags.ts` | 默认 true |

## 5. 已知风险与依赖

- `useAnnotationWorkspaceController` 已近 300 行：播放/备注/AutoGloss 不得再往里堆。
- selfCertainty 只补丁该 unit 行，禁用 `resolveSelfCertaintyHostUnitId`。
- 面板 CSS 不超过两层容器 border。
