---
title: lexicon-attachments design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-05
source_of_truth: lexicon-attachments-spec
depends_on:
  - ./requirements.md
  - ../../plans/标注页与词典页开发路线图-2026-04-22.md
  - ../../plans/三页联动最小落地计划书-2026-04-22.md
---

# Design — Lexicon Attachments (B8)

## 1. 成熟方案扫描 / Research

- 仓库既有：`media_items.details.audioBlob` 经 `DexieCollectionAdapter.insert` 先 Zod 再 `put` 原对象，Blob 可进 IndexedDB；JSON 导出剥 `audioBlob`。词典写路径已在 `linguisticServiceLexemeOps`，页面经 `languageAssetPageAccess`。
- 同类产品：FLEx LinkedFiles 是单向引用，**不**随词条删除自动清文件（Find unused files）；TLex / Lexonomy 把媒体当条目属性；Wikidata Lexeme 用外链声明式属性。
- 业内：IndexedDB 原生存 `Blob`/`File`（W3C IDB）；引用计数 GC 比孤儿扫描更适合单用户本地库。云对象存储适合多设备，不是本切片真源。
- 公认不可行：二进制塞进 `Lexemes.notes`/JSON 字段；复用 `media_items`（绑定 `textId` 转写媒体）；`CollaborationAssetService`（Supabase）；路线图旧锚点 `useTranscriptionCollaborationBridge` / `useTranscriptionData`。
- 潜在的坑：Zod 序列化会丢掉 Blob；JSON 快照膨胀；共享附件误删；第三层 panel `border`；词典页已上线须独立 flag。
- 决定：**复用** IndexedDB Blob 写入与导出剥离模式；**适配** FLEx 引用式资产但 **自研** refCount GC（比 FLEx 更严）；**不**上云 Storage。

## 2. 架构选择

- 落位：`actions`（attach/unlink）+ `state`（列表 query）+ 页面装配
- 方案 A：独立 `lexeme_assets` + `lexeme_asset_links` — **选 A**（词条不内嵌二进制，可共享）
- 拒绝：lexeme 文档内嵌 Blob；复用 `media_items`；UI 直连 Dexie

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `src/db/engine.ts` 等 | v53 两表 + 导出剥 blob | +40 行 |
| `linguisticServiceLexemeAssetOps.ts` | MIME/大小、attach、list、refcount unlink | < 220 |
| `useLexiconAttachmentController.ts` | query + attach + unlink | < 150 / < 8 hooks |
| `LexiconAttachmentSection.tsx` | 上传/缩略图/播放/下载 | < 180 |

约束自查：无 ChatWindow；无第 3 层 border；不引入 `src/features/`；页面只经 `languageAssetPageAccess`。

## 4. ADR 引用

- 相关：本地 IndexedDB 真源（既有 Dexie 链）；不新建 ADR（可逆：关 flag + 停写两表）

## 5. Feature flag

- Flag：`lexiconAttachmentsEnabled` / `VITE_LEXICON_ATTACHMENTS_ENABLED`
- 默认：`false`
- Rollout：合入 → 自用 1 周 → 再考虑默认 `true`

## 6. 失败模式 / 兼容性

- flag 关：附件区不挂载，表仍随 v53 创建
- JSON 导入无 blob：`blobOmitted`，无预览
- 回滚：关 flag；数据行可留

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/db/engine.lexemeAssets.test.ts src/services/linguisticServiceLexemeAssetOps.test.ts src/pages/LexiconPage.test.tsx` | pass |
| 守卫 | architecture-guard / docs / i18n | OK |
| E2E | `npx playwright test --project=chromium tests/e2e/criticalPaths.spec.ts` | 不回归 |
