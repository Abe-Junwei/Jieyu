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

每片一个 PR。例外：S5 写进 S3b 的同一个 PR。顺序：S0 → S0b → S1 → S2 → S3 → S4。S5 不早于入口切换；S6 在 S3 之后可以与 S4、S5 并行。S7 在 S4、S6 之后持续进行。S8 最后。产品顺序仍是 1b 到切片 7，然后 #285。本轨不插队，也不把第二程功能提前。

## Implementation tasks

- [x] S0 决策落档：ADR-0131 和本规格 → 验证：`npm run check:docs-governance`
- [x] S0b 在主路线图「唯一执行队列」下登记本工程轨：S1–S8 不替换 1b–7。S8 前，未迁走的 Chromium 用例仍是合并门槛，用 `dev:legacy` / `build:legacy` / `preview:legacy`。不改形态段，不改带日期的记录，不改 ADR-0063 正文 → 验证：`npm run check:docs-governance`
- [ ] S1a 把 `parseLiftXml` 挪到 `src/utils/lexiconLiftParse.ts`，`foreignImport.ts` 改从这里导入 → 验证：LIFT 相关 vitest；重新实测 `src/db/desktop/**` 不再到达 `engine`
- [ ] S1b 新增 `src/db/storagePortErrors.ts`（`sqliteStoragePort.ts` 改从这里导入错误类型）和 `src/db/dexieStoragePort.ts`（Dexie 实现）。`storagePort.ts` 只留安装槽，不导入 `engine`，未安装时抛错。`src/main.tsx` 先安装 `dexieStoragePort`，再调用 `installSqliteIpcPortIfEnabled`，开关打开时 SQLite 覆盖 Dexie。vitest setup 只安装 `dexieStoragePort` → 验证：`npm run typecheck`、`npm run test:vitest`、`npm run test:e2e:chromium`；重新实测目录全量为根时不到达 `engine`
- [ ] S2 源码门禁：新增 `scripts/check-desktop-boundary.mjs`（含单测）和 `scripts/legacy-zone.json`。旧区根只列 `dexie`、`src/db/engine.ts`、`src/main.tsx`、`src/App.tsx`、10 个旧路由页面、`src/db/migration/e2eMigrationHarness.ts`。门禁以桌面页面入口和三个桌面目录为根；实测为 0 才接进 `check:all` → 验证：单测（样例导入 `db/engine` 应失败）、`npm run check:desktop-boundary`
- [ ] S3a 列出 `App.tsx`（1098 行）在桌面下实际渲染的组件和 effect，逐项写「搬 / 重写 / 不要」，并写出「不要」项的文件路径。`e2eMigrationHarness`、`LegacyDataResetDialog`、`DbMigrationGateOverlay`、`BrowserDataResilience` 标为不要 → 验证：评审本文件
- [ ] S3b 在一个 PR 内完成：`index.html` 改指 `src/main.desktop.tsx` 和 `src/DesktopApp.tsx`。`src/main.desktop.tsx` 不安装 Dexie；IPC 只在 ADR-0079 开关打开时安装。旧入口是 `legacy/index.html` 和 `vite.legacy.config.ts`（`root: 'legacy'`，`publicDir` 为仓库 `public`，带 PWA，产物 `dist-legacy/index.html`）。`legacy/index.html` 的模块脚本是 `../src/main.tsx`，并复制 `<template id="jieyu-csp">` 与插入它的启动脚本。新增 `scripts/check-legacy-html-csp.mjs`，比较两份 template 和启动脚本的文本，挂进 `check:all`。`vite.shared.ts` 接收 HTML 入口和 wasm 输出目录：桌面入口是仓库根 `index.html`、wasm 写入 `dist`；旧网页入口是 `legacy/index.html`、wasm 写入 `dist-legacy`。`dist-legacy/` 写入 `.gitignore` 和 `eslint.config.js` 的 ignores。`scripts/check-voice-manifest-health.mjs` 改为读 `dist-legacy/manifest.webmanifest`。新增 `dev:legacy`、`build:legacy`、`preview:legacy`。Playwright 的 webServer、session-sidecar、`e2e-pr.yml` 改为 `build:legacy` 然后 `preview:legacy`。`App.tsx` 和 `DesktopRoute` 去掉桌面分支。S3a 标为「不要」且不在 S2 名单里的文件补进 `legacy-zone.json`。桌面入口加入门禁根 → 验证：`npm run typecheck`、`npm run build`、`npm run test:e2e:desktop-project`（Ubuntu CI；本机再跑 macOS）、`npm run test:e2e:chromium`、`npm run check:desktop-boundary`、`npm run check:all`。`desktop:smoke` 只回归骨架，不验证入口切换
- [ ] S4 产物门禁插件（只挂在桌面配置上），并检查 `dist/` 里没有 service worker。`test:e2e:desktop-project` 在开发服务器里断言 `indexedDB.databases()` 为空、界面形态为 `desktop`。打包后的 `dist/` 只由这道产物门禁检查，这条 E2E 不覆盖 `loadFile` 和 `jieyu-app://`。平台范围是 Ubuntu CI 加本机 macOS → 验证：在故意违规的临时分支上三道门禁都失败，主干全绿
- [ ] S5 文档，与 S3b 同一个 PR：`AI_QUICKSTART.md`、`copilot-instructions.md` 写明 `dev` / `build` 是桌面，`dev:legacy` / `build:legacy` / `preview:legacy` 只给尚未迁走的 Chromium 用例。主路线图 §2.1 第 4 条和单库计划里「触交互仍一律 Chromium」改为：桌面页面、壳层和 `src/db/desktop` 跑 `test:e2e:desktop-project`（Ubuntu CI 加本机 macOS）；`test:e2e:chromium` 只覆盖仍走旧网页构建的组 → 验证：`npm run check:docs-governance`
- [ ] S6 台账：在 `old-path-exit.record.json` 新增 `features` 数组（`id`、`status`、`paths`、`oldTests`、`replacement`、`desktopTests`、`decision`）。不新增 `surface` 类别；记录没有 `surfaces` 字段，每条的 `surface` 仍是 `production`、`scripts`、`ci`、`e2e`、`keep` 之一。`desktop-routes` 补齐 10 个旧路由页面；`check-old-path-exit.mjs` 增加校验，并新增单测 → 验证：该单测和 `npm run check:old-path-exit`
- [ ] S7 前移循环：每个功能先进 ADR-0086 白名单，再按 ADR-0131 第 5 条实现并关账；E2E 按 #329 分组迁到 Electron。每迁完一组，点名更新主路线图 #329 进度、单库计划 M7-C、试用地图顶部的「六组 keep」。未迁的组保持旧门槛。不删「Chromium 123 通过」这类已发生记录 → 验证：每片跑 `check:desktop-boundary`、`test:e2e:desktop-project`、`npm run check:docs-governance`
- [ ] S8 退场：前提是台账没有 `planned` 和 `in-progress` 条目、#329 已完成、#328 已有决定。先打 tag `legacy-web-final`，再删旧入口（含 `legacy/`）、旧页面、Dexie、`vite.legacy.config.ts`、Chromium 门禁。同一个 PR 把仍在描述现状的句子改成已删除，并写入第二程开工约束。不改带日期的变更记录、已落地切片里的 Dexie 证据、写明不再往下补的存储端口旧记录，也不改 ADR-0063 正文 → 验证：typecheck、全量 vitest、Ubuntu CI 与本机 macOS 的 `test:e2e:desktop-project`、`check:all`、`npm run check:docs-governance`

S8 要改的现状句：

- 主路线图形态段：浏览器构建和 Dexie 已删；复用旧实现从 tag `legacy-web-final` 取，再按 ADR-0131 第 5 条前移。
- 主路线图技术边界：去掉「PWA 页约束浏览器构建」。`browserslist` 仍是 Electron 44 的 Chromium 152。
- 主路线图 §2.1 第 4 条：交互门槛只剩桌面端到端测试。
- 主路线图 #329 第 7 条和切片 7 的退出条件：#329 完成。userData 和协作代码留下。
- 主路线图 C4：浏览器构建已删。协作代码仍留在仓库里，桌面构建继续按 ADR-0047 剔除。C4 不排进 #285。
- 单库计划 M7-C，以及「Chromium 门槛不提前撤」：改成已退出。保留 userData 和协作代码。
- 试用地图顶部 #329 那条：改成已退出。按日期写下的「保留浏览器构建」不动。
- `docs/architecture/offline-pwa-first-visit-expectations.md` 文首：浏览器构建已删，本页只作历史。
- `AGENTS.md`、`copilot-instructions.md`、`AI_QUICKSTART.md`：合并门槛改为桌面端到端测试。

S8 在主路线图新增「第二程开工约束」。四组功能的编号和归属不改。第二程顺序仍按试用地图：试用之后进 #285，先词典页闭环，再语料库页闭环，A 系列按需再做。约束是：

- 存储只写 `src/db/desktop`。`storagePort` 没有 Dexie 默认实现。
- 复用旧页面或旧测试走前移：ADR-0086 白名单、`features` 台账、纯逻辑和展示组件可复用、存储重写、桌面测试替换旧断言。源码从 `legacy-web-final` 取。
- 验收用桌面端到端测试和 SQLite 读回。
- #326 保持关闭。
- ADR-0098 的模型下载、持久管理、转码和随包分发仍在 #285，做在 Electron 里。
- B7 仍在第二程。
- 协作代码留下，C4 仍不排期。试用继续互传项目包。
- FR-049–051 的词典发布是导出和发布，不是浏览器产品。
- Linux / Intel Mac 不因此成为首发平台。

## Pre-merge gates

- [ ] `npm run typecheck`
- [ ] 触及域的 `vitest`；S1b 跑全量 `npm run test:vitest`
- [ ] 触及壳层或入口：`npm run test:e2e:chromium` + `npm run test:e2e:desktop-project`
- [ ] `npm run check:architecture-guard`
- [ ] 触及 docs：`npm run check:docs-governance`
- [x] 不适用：不启用 feature flag

## Post-merge

- [ ] S8 完成后删除 `docs/execution/specs/desktop-legacy-isolation/`
