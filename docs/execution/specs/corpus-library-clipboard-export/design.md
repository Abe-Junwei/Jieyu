---
title: corpus-library-clipboard-export design
doc_type: execution-spec-design
status: active
owner: corpus
last_reviewed: 2026-09-04
source_of_truth: corpus-library-clipboard-export-spec
depends_on:
  - ./requirements.md
  - ../../plans/语料库页面开发路线图-2026-04-22.md
  - ../corpus-library-workset-shell/design.md
---

# Design — Corpus Library Clipboard Export (B5b)

## 1. 成熟方案扫描 / Research

- 仓库既有：AI 侧 `navigator.clipboard.writeText` + 特性检测（`useAiChatMessageInteractionController`）；B12 `buildB5bExportManifest` 是 artifact 清单，不是句段出站。
- 同类产品：ELAN 复制带时间码的 annotation 文本；FLEx Concordance 复制结果与 Texts 编辑器隔离；Obsidian/Zotero 复制 markdown 引用。
- 业内：W3C Clipboard 多 MIME 用 `ClipboardItem`；WebKit 仅保证 `text/plain` / `text/html` / `text/uri-list` / `image/png`，**不保证** `text/markdown`。
- 公认不可行：把 markdown 塞进自定义 MIME 当 P0；复用 `buildB5bExportManifest`；出站镜像转写 `selectedUnitIds`。
- 潜在的坑：筛选隐藏行仍须导出 basket；空选若仍 `writeText` 会覆盖用户剪贴板；ChatWindow hotspot 零触及。
- 决定：**适配** 仓内 `writeText` + 语料路线图 §5.4 字段；**复用** `buildTranscriptionDeepLinkHref` 与 `formatTime`；**自研** 纯函数 formatter（golden）；**不**上 ClipboardItem 双 MIME。

## 2. 架构选择

- 落位：`derived`（payload）+ `actions`（copy）
- 方案 A：两个按钮，各自 `writeText(plain|markdown)` — **选 A**
- 拒绝：单次 ClipboardItem 双 MIME（Safari 会丢掉 markdown）；HTML 剪贴板（P1）

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `corpusWorksetExport.ts` | plain / markdown 格式化 | < 80 |
| `corpusWorksetClipboard.ts` | 特性检测写入 | < 30 |
| `useCorpusLibraryController.ts` | 组装 payload + copy | 仍 < 220 / < 12 hooks |
| `CorpusLibraryWorkspace.tsx` | 按钮与状态 | +40 |

约束自查：无 ChatWindow；无第 3 层 border；不引入 `src/features/`。

## 4. ADR 引用

- ADR-0011：本切片用转写深链 href，不落地 Resolver Core
- 新建 ADR：否

## 5. Feature flag

- 沿用 `corpusLibraryPageEnabled`（页面已关）；不新增第二开关

## 6. 失败模式 / 兼容性

- flag 关：占位页，无复制按钮
- 无 clipboard：文案提示
- 回滚：关页面 flag

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/pages/corpusWorksetExport.test.ts src/pages/CorpusLibraryPage.test.tsx src/pages/FeatureAvailabilityPage.layoutGuard.test.ts` | pass |
| 守卫 | architecture-guard / docs | OK |
| E2E | 现网 `/corpus` 占位路径（flag 关） | 不回归 |
