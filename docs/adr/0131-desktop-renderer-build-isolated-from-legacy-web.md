---
title: ADR 0131 - 桌面渲染层单独入口与构建，旧网页靠门禁隔离
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-20
source_of_truth: decision-record
depends_on:
  - ./0063-desktop-only-after-electron-skeleton.md
  - ./0064-storage-freeze-until-desktop-opens-real-projects.md
  - ./0079-desktop-shell-installs-sqlite-storage-port.md
  - ./0086-desktop-release-scope-and-format-freeze.md
  - ./0123-dev-server-shows-the-desktop-shell.md
---

# ADR 0131：桌面渲染层单独入口与构建，旧网页靠门禁隔离

## 背景

ADR-0063 定了只交付桌面。ADR-0064 定了 #329 把 E2E 迁到 Electron 之后再删浏览器构建和 Dexie。ADR-0123 定了 `vite dev` 显示桌面外壳，旧网页只在 `VITE_LEGACY_WEB_SURFACE=true` 的测试构建里出现。

现在 Electron 和浏览器加载同一份 `index.html → src/main.tsx → src/App.tsx`，Electron 的三个加载点都读这份产物：`JIEYU_VITE_DEV_SERVER`、`dist/index.html`，以及打包态 `jieyu-app://` 所读的 `dist/`。桌面页面还是旧页面，由 `DesktopRoute`、`resolveDesktopSurface` 在运行时决定。

2026-11-20 在 `2017062b`（已合入主干 `cd44f04f`）上用 TypeScript 导入图实测。统计含动态导入，不含 type-only 导入和测试：

- 从 39 个桌面页面入口（`src/pages/Desktop*`、`useDesktop*`）出发，可达 123 个源模块，到不了 `src/db/engine.ts`，也到不了旧页面。
- 从 `src/main.tsx` 出发，只算静态导入可达 236 个模块，其中经 `App.tsx → useAppDataResilienceEffects → db/engine` 到达 Dexie；算上动态导入可达 1684 个，含 10 个旧路由页面。
- 把 `src/desktop/**`、`src/db/desktop/**`、`src/hooks/desktop/**` 全部当根，可达 469 个模块，其中有两条边进 Dexie：
  - `sqliteStorageHost → sqliteStoragePort → storagePort → engine`。`storagePort.ts` 的默认绑定是 `dexieStoragePort`。
  - `db/desktop/foreignImport → utils/lexiconLiftImport → storagePortImportLexicon → engine`。`parseLiftXml` 和 Dexie 写入在同一个文件里。

桌面页面已经隔离；旧代码从共同的启动入口和这两个混合模块进入桌面。

## 调研

- Strangler Fig：新旧并存时，新系统有自己的入口，旧系统逐块下线。
- 分开的 composition root：同一仓库出多个产物时各自有入口、各自构建，例如 VS Code 的 desktop 与 web 入口、Electron renderer 单独打包。
- 边界检查（dependency-cruiser、eslint-plugin-boundaries、Nx module boundaries）都是「按区禁止跨区导入」。源码检查能报出导入链，产物检查兜住别名、动态导入和副作用导入。

不采用：
- 只靠运行时分支：产物仍带旧代码，分支一错旧页面就会跑起来。
- 拆仓库或搬到 `src/features`：共享模块要复制，历史和 issue 链接会断；实测只需切开入口和两个混合模块。
- 引入 dependency-cruiser：规则只有一条，用现成的 TypeScript 编译器 API 实现即可。

## 决定

1. **桌面占用默认入口，旧网页改名。** `index.html → src/main.desktop.tsx → src/DesktopApp.tsx` 只挂桌面路由，没有旧页面可回落。`vite.config.ts`、`dist/`、`npm run dev`、`npm run build` 都是桌面的，所以 Electron 三个加载点的路径不变。旧网页改为 `index.legacy.html → src/main.tsx → src/App.tsx`，配置为 `vite.legacy.config.ts`（产物 `dist-legacy/`），用 `dev:legacy`、`build:legacy` 启动和构建，只给 Chromium E2E 用。PWA 只放在旧网页的配置里。
2. **继续执行 ADR-0123。** `vite dev` 显示的就是桌面入口；没有桥接时只显示「请在解语桌面窗口中打开」。旧网页只出现在 Chromium E2E 使用的旧网页构建里。
3. **拆掉 `App.tsx` 的桌面分支和切换入口在同一个 PR 里完成。** 这个 PR 的验证必须包含 `desktop:smoke`、`test:e2e:desktop-project` 和 `test:e2e:chromium`；不允许先拆壳再切入口。
4. **三道门禁，零容忍，不设 allowlist。**
   - 源码门禁 `check:desktop-boundary`：根是桌面渲染入口的可达集。新入口建好之前，以桌面页面入口为根。从这些根出发，不得到达旧区。旧区指 `scripts/legacy-zone.json` 列出的根，以及所有导入这些根的模块。两条混合边拆掉以后，再把 `src/desktop/**`、`src/db/desktop/**`、`src/hooks/desktop/**` 全部加为根。门禁只在当次实测为 0 时才接进 `check:all`。
   - 产物门禁：桌面构建的模块里出现 `dexie`、`src/db/engine.ts` 或旧区根模块时，构建失败。
   - 运行时门禁：Electron E2E 断言渲染层 IndexedDB 为空、界面形态为 `desktop`。桌面入口不装载 `e2eMigrationHarness`。
5. **前移旧功能。** 一律先进 ADR-0086 白名单，再登记到 `scripts/old-path-exit.record.json` 新增的 `features` 数组（不新增 `surface` 类别）。实现时纯逻辑和展示组件可以复用，存储一律在 `src/db/desktop` 重写；旧测试的业务断言改写成桌面测试后，才算前移完成。不前移的功能交 #328，由用户决定。
6. **退场。** 删除需同时满足三条：台账里没有未完成条目、#329 已完成、#328 已有决定。删除前先打 tag `legacy-web-final`，然后删掉旧入口、旧页面、Dexie、`vite.legacy.config.ts` 和 Chromium 门禁。之后要复用旧功能，从 tag 取回原实现，仍按第 5 条前移。

## 后果

- Electron 不再加载 Dexie、旧页面和 service worker；共享模块一旦引到旧区，门禁会给出导入链，修法是拆开该模块。
- Dexie 实现挪到 `src/db/dexieStoragePort.ts`。`storagePort.ts` 不再导入 `engine`，未安装时抛错。旧入口和测试显式安装 `dexieStoragePort`。
- Playwright 的 webServer、`e2e-pr.yml`、`test:e2e:session-sidecar-audit` 改用旧网页构建。
- 并存期间有两份 Vite 配置；Chromium 用例按 #329 每迁一组删一组。
- 执行细节见[规格](../execution/specs/desktop-legacy-isolation/requirements.md)。
