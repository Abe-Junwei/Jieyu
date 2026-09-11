---
title: corpus-library-html-bundle design
doc_type: execution-spec-design
status: active
owner: corpus
last_reviewed: 2026-09-05
source_of_truth: corpus-library-html-bundle-spec
depends_on:
  - ./requirements.md
  - ../../plans/语料库页面开发路线图-2026-04-22.md
  - ../corpus-library-clipboard-export/design.md
---

# Design — Corpus Library HTML / Bundle (P1 / B5c)

## 1. 成熟方案扫描 / Research

- 仓库既有：B5b `corpusWorksetExport.ts` + `writeText`；归档 zip 用 `fflate`（`JymService` `zipSync`/`strToU8`）；B12 `buildB5bExportManifest` 是 agent artifact 清单，不是句段出站。
- 同类产品：ELAN 复制带时间码的 annotation；FLEx Concordance 结果与 Texts 编辑器隔离后复制/导出；Obsidian/Zotero 以 Markdown/HTML 出站。
- 业内：W3C Clipboard 多 MIME 用 `ClipboardItem`；Chrome 要求条目值为 **Blob**（plain 若为 DOMString 会抛）；WebKit 只保证 `text/plain` / `text/html` / `text/uri-list` / `image/png`，**不保证** `text/markdown`。
- 公认不可行：`document.execCommand('copy')`；自定义 markdown MIME 当 P0；把转写原文 `innerHTML` 进剪贴板；新建 JSZip；复用 B12 manifest；本切片走 EAF 第二管线。
- 潜在的坑：Safari 用户激活在 `await` 后过期；混媒体 header `mediaId` 须沿用 B5b 省略规则；controller 已 ~10 hooks，禁止再加到超过 12；页面不得 `import` `../services`。
- 决定：**复用** B5b payload / 深链 / `fflate`；**适配** ClipboardItem `text/html`+`text/plain` Blob，缺 API 时回退 `writeText(plain)`；**自研** 白名单 HTML formatter 与 workset `manifest.json`；**不**接 ChatWindow / EAF。

## 2. 架构选择

- 落位：`derived`（HTML/zip）+ `actions`（copy/download）
- 方案 A：HTML 按钮走 ClipboardItem，bundle 另按钮下载 zip — **选 A**
- 拒绝：单次写入 markdown MIME；空选仍 `write`/`download`；把 zip 逻辑堆进 Orchestrator

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `corpusWorksetExport.ts` | HTML escape + 1e6 长度门 | < 160 |
| `corpusWorksetClipboard.ts` | 特性检测写入 | < 80 |
| `corpusWorksetBundle.ts` | zip 字节 + `<a download>` | < 90 |
| `useCorpusLibraryController.ts` | 组装；html 并入 copy；+1 download callback | < 260 / ≤ 11 hooks |

约束自查：编排层只绑事件；无第 3 层 border；不引入 `src/features/`。

## 4. ADR 引用

- ADR-0011：深链 href，不落地 Resolver Core
- 新建 ADR：否（可逆的出站格式，不是持久化协议）

## 5. Feature flag

- 沿用 `corpusLibraryPageEnabled`；默认 `false`；不新增第二开关

## 6. 失败模式 / 兼容性

- 空选：`CORPUS_EXPORT_EMPTY`，不写剪贴板、不下载
- 合计字符 > 1_000_000：`CORPUS_EXPORT_TOO_LONG`
- 无 clipboard / 抛错：`CORPUS_EXPORT_CLIPBOARD_UNAVAILABLE`；HTML 无 ClipboardItem 时回退 plain
- flag 关：占位页，无新按钮
- 回滚：关页面 flag

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/pages/corpusWorksetExport.test.ts src/pages/corpusWorksetClipboard.test.ts src/pages/corpusWorksetBundle.test.ts src/pages/CorpusLibraryPage.test.tsx src/pages/FeatureAvailabilityPage.layoutGuard.test.ts` | pass |
| 守卫 | architecture-guard / docs / workflow | OK |
| E2E | `npm run test:e2e:chromium` | `/corpus` 占位不回归 |
