---
title: lexicon-attachments requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-05
source_of_truth: lexicon-attachments-spec
---

# Requirements — Lexicon Attachments (B8)

## 1. What & Why

- **要做什么**：词条详情挂载图片与语言附件（音频/文档）；统一资产表存 Blob，词条只持有引用；删除先断链再按 refCount 回收。
- **为什么现在做**：Stage B 在 B6 合入后，下一切片是 P1-2 词典附件；词典页已活且无附件工作区。
- **不做什么**：不接 ChatWindow / `useTranscriptionData` / 协作桥；不把二进制写进 `LexemeDocType`；不复用 `media_items`；不做 FLEx/LIFT 附件导出；不默认打开 flag。

## 2. 用户场景（≤ 3 条）

1. 研究者在词条详情上传 PNG：缩略图回显，刷新后元数据与 Blob 仍在。
2. 研究者挂 WAV 并填 languageCode：可播放或下载；JSON 导出不含 Blob。
3. 删除附件：词条链接先消失；无其它引用时 Blob 行删除。

## 3. 验收标准（可测）

- [ ] Dexie v53：`lexeme_assets` / `lexeme_asset_links` 写→reload→readback 保留 `Blob`
- [ ] MIME 白名单 + 5MB；非法抛 `UNSUPPORTED_TYPE` / `TOO_LARGE` / `EMPTY` / `NOT_FOUND`
- [ ] 两链接共享一资产：unlink 一次保留 Blob，第二次删除行
- [ ] `lexiconAttachmentsEnabled` 默认 false：词典页无附件区；开则上传后列表 readback
- [ ] JSON 导出剥离 `blob`；不进 `RECOVERY_EXPORT_COLLECTIONS`

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Schema / DB | `src/db/engine.ts`、`types.ts`、`schemas.ts`、`io.ts` | v53 + 两表 |
| Service | `linguisticServiceLexemeAssetOps.ts`、`LinguisticService.ts` | 新增 attach/list/unlink |
| Controller | `src/pages/useLexiconAttachmentController.ts` | 新增 |
| UI | `LexiconAttachmentSection.tsx`、`LexiconPage.tsx` | 装配 |
| Flag / i18n | `featureFlags.ts`、`dictKeys` / dictionaries | 新开关与文案 |
| 测试 | `engine.lexemeAssets.test.ts`、ops 测试、`LexiconPage.test.tsx` | 新增 / 修改 |

## 5. 已知风险与依赖

- Zod `instanceof(Blob)` 只在 insert 前校验；读回不经 Zod，避免 realm 不一致。
- 面板 CSS 禁止第 3 层 `border`；附件卡只用背景/间距。
- engine.ts 接近 2000 行上限：只加 v53 块与 adapter 行。
