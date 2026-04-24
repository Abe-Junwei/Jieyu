---
title: 转写页 URL 深链合同
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-04-24
source_of_truth: implementation
---

# 转写页 URL 深链合同（`/transcription`）

## 适用范围

浏览器地址栏与站内 `Link`/`navigate` 进入转写工作区时，使用 **query string** 传递一次性上下文。实现入口：`src/pages/TranscriptionPage.ReadyWorkspace.tsx`（挂载后 `replace` 清参）与工具 `src/utils/transcriptionUrlDeepLink.ts`。

## 参数一览

| 参数 | 必填 | 说明 |
|------|------|------|
| `textId` | 打开指定项目时必填 | 切换到该文本项目并 `loadSnapshot`；无效时清参并 toast。 |
| `mediaId` | 否 | 快照就绪后选中该 `media_items` 行（须属于当前 `textId`）。 |
| `layerId` | 否 | 选中并聚焦侧栏对应层。 |
| `unitId` | 否 | 选中时间轴单元；默认按 **句段 unit** 解析。 |
| `unitKind` | 否 | 仅当取值为 `segment` 时，将 `unitId` 按 **独立层 segment** 解析。 |

## 站内返回链接（无 query）

词典、标注占位、语料占位等页的「返回转写」使用 **`buildTranscriptionWorkspaceReturnHref()`**：读取 `sessionStorage` 中最近一次在转写页就绪时写入的 `textId`（及可选 `mediaId`），拼出与上表一致的深链；若无记忆则回到 `/transcription`。写入：`rememberTranscriptionWorkspaceReturnHint`（由 `TranscriptionPageReadyWorkspace` 在 `phase === 'ready'` 时更新）。

## 词典页出站（命中 → 转写）

`LinguisticService.listLexemeTranscriptionJumpTargets(lexemeId)` 从 `token_lexeme_links` 经 `unit_tokens` / `unit_morphemes` 解析到 `layer_units`，再拼 **`buildTranscriptionDeepLinkHref`**（`textId`、`mediaId`（若有）、`layerId`、`unitId`、必要时 `unitKind=segment`）。UI：`src/pages/LexiconPage.tsx`「转写命中」区块。

## 与三页联动计划的关系

与 `docs/execution/plans/三页联动最小落地计划书-2026-04-22.md` **P0-1 深链合同**对齐：`textId` / `mediaId` / `layerId` / `unitId` 语义与转写内选区一致；跨页往返状态（排序、工作集等）仍按该计划其它键名扩展，本文不重复。
