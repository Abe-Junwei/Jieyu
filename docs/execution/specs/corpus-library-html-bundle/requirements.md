---
title: corpus-library-html-bundle requirements
doc_type: execution-spec-requirements
status: active
owner: corpus
last_reviewed: 2026-09-05
source_of_truth: corpus-library-html-bundle-spec
---

# Requirements — Corpus Library HTML / Bundle (P1 / B5c)

## 1. What & Why

- **要做什么**：工作集出站增加 `text/html` 剪贴板、空选/超长/剪贴板失败诊断码，以及 `fflate` 小 bundle（README + snippets + manifest）。
- **为什么现在做**：B5b 只做了 `writeText` plain/Markdown；语料 P1 与产品方案 §1.2.5 阻塞于 HTML + 可诊断错误 + 可选 bundle。
- **不做什么**：不写转写真源；不做 EAF/TextGrid 第二管线；不接 ChatWindow / B2 事件；不复用 B12 `buildB5bExportManifest`；不新增第二 flag；不把 `text/markdown` 当 ClipboardItem MIME。

## 2. 用户场景（≤ 3 条）

1. 已选句段：复制 HTML，系统同时写入 `text/html` 与 `text/plain`；外软可粘贴链接与转义后的句段文本。
2. 空选 / 超长 / 无剪贴板：不写入、不下载，文案含稳定错误码。
3. 下载 bundle：得到 zip；空工作集不触发下载。

## 3. 验收标准（可测）

- [ ] HTML golden：白名单标签、转义 `<`、含 `/transcription?` 深链；空工作集返回 `''`
- [ ] `ClipboardItem` 双 MIME 为 Blob；无 `ClipboardItem` 时回退 `writeText(plain)`
- [ ] 空选不调用 `clipboard.write` / 不下载；超长 `CORPUS_EXPORT_TOO_LONG`
- [ ] zip 含 `README.txt`、`snippets.md`、`snippets.html`、`snippets.txt`、`manifest.json`
- [ ] flag 关 `/corpus` 仍为占位；不改 ChatWindow

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| Helper | `corpusWorksetExport.ts` | HTML 格式化 + 长度门 |
| Helper | `corpusWorksetClipboard.ts` | ClipboardItem 写入 |
| Helper | `corpusWorksetBundle.ts` | fflate zip + 下载 |
| Controller | `useCorpusLibraryController.ts` | html copy + download |
| UI / i18n | Workspace + dictKeys | 按钮与错误码文案 |
| 测试 | export / clipboard / bundle / page | golden + mock |

## 5. 已知风险与依赖

- WebKit 不保证 `text/markdown` MIME；HTML 必须与 plain Blob 成对。
- Safari 用户激活：payload 在 `await` 前同步算完。
- 回滚：关 `corpusLibraryPageEnabled`。
