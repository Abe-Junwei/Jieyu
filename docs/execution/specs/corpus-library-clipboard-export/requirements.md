---
title: corpus-library-clipboard-export requirements
doc_type: execution-spec-requirements
status: active
owner: corpus
last_reviewed: 2026-09-04
source_of_truth: corpus-library-clipboard-export-spec
---

# Requirements — Corpus Library Clipboard Export (B5b)

## 1. What & Why

- **要做什么**：把当前 `corpusBasket` 复制为 `text/plain` 与 Markdown，字段含 unit / 媒体 / 时间码 / 转写深链。
- **为什么现在做**：B5a-1 工作集已落地；P0 出站阻塞于本切片。
- **不做什么**：不写转写真源；不做 HTML / bundle / EAF；不接 AI / ChatWindow；不建 `corpusRef` Resolver Core；不把 basket 写入 URL / Dexie。

## 2. 用户场景（≤ 3 条）

1. 工作集为空：复制按钮禁用，提示先选句段。
2. 已选句段：复制纯文本或 Markdown，剪贴板内容可对拍且含深链 / id。
3. 无 Clipboard API：失败提示，不抛到页面。

## 3. 验收标准（可测）

- [ ] 空工作集不调用 `clipboard.writeText`
- [ ] golden：plain / markdown 含 unitId、textId、mediaId、时间码、`/transcription?` 深链
- [ ] 出站只消费 basket，不受列表筛选隐藏影响
- [ ] flag 关 `/corpus` 仍为占位；不改 ChatWindow

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| Helper | `corpusWorksetExport.ts` | 纯函数格式化 |
| Helper | `corpusWorksetClipboard.ts` | `writeText` 特性检测 |
| Controller | `useCorpusLibraryController.ts` | copy action |
| UI | `CorpusLibraryWorkspace.tsx` | 两个复制按钮 |
| i18n | `dictKeys` / catalogs | 按钮与状态文案 |
| 测试 | `corpusWorksetExport.test.ts`、page test | golden + clipboard |

## 5. 已知风险与依赖

- `text/markdown` ClipboardItem MIME 非 WebKit 必支持；本切片用两次 `writeText`，不双 MIME 一次写入。
- 回滚：关 `corpusLibraryPageEnabled`。
