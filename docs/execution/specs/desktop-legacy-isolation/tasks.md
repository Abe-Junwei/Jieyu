---
title: desktop-legacy-isolation tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-11-20
source_of_truth: desktop-legacy-isolation-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — desktop-legacy-isolation

每片一个 PR。顺序：S0 → S1 → S2 → S3 → S4；S5、S6 在 S3 之后可以并行；S7 在 S4、S6 之后持续进行；S8 最后。

## Implementation tasks

- [x] S0 决策落档：ADR-0131 和本规格 → 验证：`npm run check:docs-governance`
- [ ] S1a 把 `parseLiftXml` 挪到 `src/utils/lexiconLiftParse.ts`，`foreignImport.ts` 改从这里导入 → 验证：LIFT 相关 vitest；重新实测 `src/db/desktop/**` 不再到达 `engine`
- [ ] S1b 新增 `src/db/storagePortErrors.ts`；把 `storagePort.ts` 的默认值改为未安装时抛错，由 `src/main.tsx` 和 vitest setup 安装 Dexie 实现 → 验证：`npm run typecheck`、`npm run test:vitest`、`npm run test:e2e:chromium`；重新实测目录全量为根时不到达 `engine`
- [ ] S2 源码门禁：新增 `scripts/check-desktop-boundary.mjs`（含单测）和 `scripts/legacy-zone.json`，以桌面页面入口和三个桌面目录为根；实测为 0 才接进 `check:all` → 验证：单测（样例导入 `db/engine` 应失败）、`npm run check:desktop-boundary`
- [ ] S3a 列出 `App.tsx` 在桌面下实际渲染的组件和 effect，逐项写「搬 / 重写 / 不要」。`e2eMigrationHarness`、`LegacyDataResetDialog`、`DbMigrationGateOverlay`、`BrowserDataResilience` 标为不要 → 验证：评审本文件
- [ ] S3b 在一个 PR 内完成：`index.html` 改指 `src/main.desktop.tsx` 和 `src/DesktopApp.tsx`；旧入口改为 `index.legacy.html` 和 `vite.legacy.config.ts`（带 PWA，产物到 `dist-legacy/`）；新增 `dev:legacy`、`build:legacy`；Playwright 的 webServer、session-sidecar、`e2e-pr.yml` 改用旧网页构建；`App.tsx` 和 `DesktopRoute` 去掉桌面分支；桌面入口加入门禁根 → 验证：`npm run typecheck`、`npm run build`、`npm run desktop:smoke`、`npm run test:e2e:desktop-project`、`npm run test:e2e:chromium`、`npm run check:desktop-boundary`
- [ ] S4 产物门禁插件（只挂在桌面配置上），并检查 `dist/` 里没有 service worker；桌面 E2E 断言 `indexedDB.databases()` 为空、界面形态为 `desktop` → 验证：在故意违规的临时分支上三道门禁都失败，主干全绿
- [ ] S5 文档：在 `AI_QUICKSTART.md`、`copilot-instructions.md` 写明 `dev` / `build` 是桌面，`dev:legacy` / `build:legacy` 只给 Chromium E2E 用 → 验证：`npm run check:docs-governance`
- [ ] S6 台账：在 `old-path-exit.record.json` 新增 `features` 数组（`id`、`status`、`paths`、`oldTests`、`replacement`、`desktopTests`、`decision`），`surfaces` 保持五类；`desktop-routes` 补齐 10 个旧路由页面；`check-old-path-exit.mjs` 增加校验，并新增单测 → 验证：该单测和 `npm run check:old-path-exit`
- [ ] S7 前移循环：每个功能先进 ADR-0086 白名单，再按 ADR-0131 第 5 条实现并关账；E2E 按 #329 分组迁到 Electron → 验证：每片跑 `check:desktop-boundary`、`test:e2e:desktop-project`
- [ ] S8 退场：前提是台账没有 `planned` 和 `in-progress` 条目、#329 已完成、#328 已有决定。先打 tag `legacy-web-final`，再删旧入口、旧页面、Dexie、`vite.legacy.config.ts`、Chromium 门禁，并更新 AGENTS.md / copilot-instructions / AI_QUICKSTART → 验证：typecheck、全量 vitest、三平台桌面 E2E、`check:all`

## Pre-merge gates

- [ ] `npm run typecheck`
- [ ] 触及域的 `vitest`；S1b 跑全量 `npm run test:vitest`
- [ ] 触及壳层或入口：`npm run test:e2e:chromium` + `npm run test:e2e:desktop-project`
- [ ] `npm run check:architecture-guard`
- [ ] 触及 docs：`npm run check:docs-governance`
- [x] 不适用：不启用 feature flag

## Post-merge

- [ ] S8 完成后删除 `docs/execution/specs/desktop-legacy-isolation/`
