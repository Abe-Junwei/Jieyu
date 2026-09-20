---
title: lexicon-lift-import design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-20
source_of_truth: lexicon-lift-import-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon LIFT Import

## 1. 成熟方案扫描 / Research

- 仓库既有：B3e `lexiconLiftExport` 是同一子集的出站；`saveLexeme` 走 Dexie `put`（可按 id upsert）并 emit `lexeme-updated`；`deleteLexiconEntry` 的 `{ save, list }` deps 可复用；转写 `useImportExport` 是项目归档/EAF，不是词库。
- 同类产品：FLEx / WeSay LIFT 0.13 按 **entry/sense guid** 合并（Zook Technical Notes；FLEx Import LIFT help）。无 guid → 当新条目。Send/Receive（Chorus）才是协作真源，单文件 import 是交换路径。
- 业内：SIL lift-standard RNG 0.13。权威实现 .NET **LiftIO**；浏览器无维护中的 0.13 importer。`DOMParser` 是平台原生 XML。
- 公认不可行：从 `/corpus` 导入词典包；把 flextext 当词库；一次做三档冲突 UI；npm 拉未维护 lift 包；嵌套 sense 树。
- 潜在的坑：FLEx 默认「LIFT 没有的字段保留」；冲突三选项（跳过 / 覆盖 / 复制）。坏 XML 的 `parsererror` 文档仍 `parseFromString` 成功。重复 `lang` 违 RNG。
- 决定：**适配** 0.13 最小子集（B3e 的逆映射）；**复用** `saveLexeme` + nested ids；**自研** `DOMParser` 解析。冲突取 FLEx 选项 2（覆盖已映射字段），未映射字段从现有行保留。无新依赖。

## 2. 架构选择

- 落位：`derived`（parse）+ `actions`（upsert + list readback）
- 选 A：`src/utils/lexiconLiftImport.ts` + 页面 hidden file input
- 拒绝：新 controller；接到 `useImportExport`；Corpus 菜单

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `src/utils/lexiconLiftImport.ts` | parse + merge + save/list | < 220 |
| `LexiconPage.tsx` | 按钮 + file input | +30 |
| i18n 三文件 | 导入文案 | 增量 |

约束自查：无 `src/features/`；无新 hook；无第三层 border。

## 4. ADR 引用

- 无新 ADR。词库仍不同步协作（ADR-0034）。

## 5. Feature flag

- 无。与 B3e / B3c 相同。

## 6. 失败模式 / 兼容性

- 坏 XML / 非 0.13 / 无有效 entry：零 `save`。
- 回滚：删按钮与 helper；已导入行需用户自行删。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元 | `npx vitest run src/utils/lexiconLiftImport.test.ts src/pages/LexiconPage.test.tsx` | pass |
| 守卫 | architecture-guard / docs / workflow | OK |
| e2e | `test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts` | 导入按钮可见 |
