---
title: desktop-legacy-isolation design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-20
source_of_truth: desktop-legacy-isolation-spec
depends_on:
  - ./requirements.md
  - ../../../adr/0131-desktop-renderer-build-isolated-from-legacy-web.md
  - ../../../adr/0123-dev-server-shows-the-desktop-shell.md
---

# Design — desktop-legacy-isolation

## 1. 成熟方案扫描 / Research

- 仓库既有最相似的模式：`scripts/check-direct-db-imports.mjs`（导入门禁）、`scripts/check-old-path-exit.mjs` + `old-path-exit.record.json`（#438 台账）、`scripts/desktop-project-flow.mjs`（Electron E2E）、`src/db/desktop/operationContract.test.ts`。
- 同类产品 / 标杆实现：VS Code 的 desktop 与 web 入口各自构建；Electron renderer 单独打包；Strangler Fig 迁移中新系统先有自己的入口。
- 业内 best practice：dependency-cruiser、eslint-plugin-boundaries、Nx module boundaries 都是按区禁止导入；源码检查配合产物检查（rolldown `generateBundle` 读取模块列表）。
- 公认不可行 / 反模式：只靠运行时分支；长期 allowlist；先拆壳再切入口；拆仓库。
- 潜在的坑：type-only 导入不计；`import.meta.glob` 和副作用导入只能靠产物门禁兜底；共享 Vite 配置如果带上 `VitePWA`，桌面包就会有 service worker；`navigator.webdriver` 分支会把迁移探针装进渲染层。
- 决定：**适配**。门禁用 TypeScript 编译器 API 实现，不新增依赖；台账在现有记录上扩展；构建沿用 Vite。

## 2. 架构选择

- **门禁根**：用桌面渲染入口的可达集，不用目录全量。`src/desktop/skeleton/sqliteStorageHost.ts` 由 `electron/vite.config.ts` 打进主进程，不属于渲染层；但它同样经由 `storagePort` 到达 Dexie，所以先拆边，再把目录全量加为根。
- **旧区**：`scripts/legacy-zone.json` 列出的根（`dexie`、`src/db/engine.ts`、`src/main.tsx`、`src/App.tsx`、10 个旧路由页面、旧壳组件、`src/db/migration/e2eMigrationHarness.ts`），以及所有导入这些根的模块。
- **方案 A**：桌面占用默认名，旧网页改名。**方案 B**：旧网页保留默认名，桌面另起名。选 A：Electron 三个加载点（`JIEYU_VITE_DEV_SERVER`、`dist/index.html`、`app://` 协议的 `dist/`）路径不变，`npm run dev` 自然符合 ADR-0123，S8 只删不改名。代价是 Playwright 和 E2E 工作流要改用 `build:legacy`。
- **拆边**：
  1. `parseLiftXml` 挪进只做解析的 `src/utils/lexiconLiftParse.ts`；`lexiconLiftImport.ts` 改为从这里导入，并保留 Dexie 写入。
  2. `RecordingRemovalBlockedError` 等错误类型挪进 `src/db/storagePortErrors.ts`；`storagePort.ts` 的默认值改为未安装时抛错，由 `src/main.tsx` 与 vitest setup 显式安装 `dexieStoragePort`。

## UI 精稿对照

不适用：不新增或改动界面。桌面入口在没有桥接时，沿用 ADR-0123 现有的 `unavailable` 界面和文案。

## 3. 落位清单

| 文件 | 职责 | 复杂度估计 |
| --- | --- | --- |
| `src/utils/lexiconLiftParse.ts` | LIFT XML 解析，不碰存储 | 从现文件搬出 |
| `src/db/storagePortErrors.ts` | 存储操作的错误类型 | < 80 行 |
| `scripts/check-desktop-boundary.mjs` | 建导入图、计算传染集、报出导入链 | < 200 行 |
| `src/main.desktop.tsx` | i18n、observability、桌面存储安装、错误边界、路由；不装载 `e2eMigrationHarness` | < 120 行 |
| `src/DesktopApp.tsx` | 只装配桌面路由和桌面实际用到的壳组件 | < 300 行 / < 12 hooks |
| `vite.shared.ts`、`vite.legacy.config.ts` | 共同配置；旧网页配置在此基础上加 `VitePWA` 和 `dist-legacy/` | < 120 行 |
| `scripts/vite-plugin-desktop-bundle-guard.ts` | `generateBundle` 检查模块列表 | < 80 行 |

约束自查：
- [x] 不引入 `src/features/…`
- [x] `DesktopApp` 只做装配
- [ ] 实现 S3 时复核 hook 行数和 hook 数量

## 4. ADR 引用

- [ADR-0131](../../../adr/0131-desktop-renderer-build-isolated-from-legacy-web.md)；沿用 ADR-0123；依赖 ADR-0063、0064、0079、0086。

## 5. Feature flag

不启用 flag。回滚方式是回退整个 S3 PR：入口切换和拆壳在同一个 PR 里。

## 6. 失败模式 / 兼容性

- 桌面壳漏搬组件：S3a 先列出 `App.tsx` 在桌面下实际渲染的组件和 effect，逐项决定处理方式。
- vitest 依赖默认 Dexie：S1b 在 setup 里显式安装，全量 vitest 通过后才合并。
- 旧网页构建漏设变量：Playwright 的 webServer、`e2e-pr.yml`、session-sidecar 都改调 `build:legacy`，由 `vite.legacy.config.ts` 固定 `VITE_LEGACY_WEB_SURFACE=true`。
- 旧浏览器数据：不迁移（ADR-0064；#326 已取消）。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npm run test:vitest`（S1b 需要全量） | all pass |
| 源码门禁 | `npm run check:desktop-boundary` | 0 违规 |
| 产物门禁 | `npm run build` | 成功，模块清单中没有旧区模块 |
| Electron | `npm run desktop:smoke`、`npm run test:e2e:desktop-project` | 三个平台 green |
| Chromium（S8 前） | `npm run test:e2e:chromium` | green |
| 结构守卫 / 文档 | `npm run check:architecture-guard`、`npm run check:docs-governance` | OK |
