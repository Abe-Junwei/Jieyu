---
title: ADR 0130 - 桌面渲染层单独入口与构建，旧网页靠门禁隔离
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
---

# ADR 0130：桌面渲染层单独入口与构建，旧网页靠门禁隔离

## 背景

ADR-0063 定了只交付桌面。ADR-0064 定了 #329 把 E2E 迁到 Electron 之后再删浏览器构建和 Dexie。在那之前，旧网页页面还要给 Chromium E2E 用。

现在 Electron 和浏览器加载同一份 `index.html → src/main.tsx → src/App.tsx`。`App.tsx` 用 `DesktopRoute` 和 `electronDesktopPresent()` 在运行时决定显示桌面页面还是旧页面。2026-11-20 用 TypeScript 导入图实测（基线 a3923e79）：

- 33 个桌面页面入口（`src/pages/Desktop*`、`useDesktop*`）可达 60 个源模块，没有一个引到 `src/db/engine.ts`、`dexie` 或旧页面。
- `src/main.tsx` 只算静态导入就引到 Dexie：`main.tsx → App.tsx → useAppDataResilienceEffects → db/engine`。算上动态导入共 1667 个源模块，其中 11 个旧页面、130 个旧数据层模块。

所以桌面页面本身已经隔离，旧代码是从共同的启动入口和壳层进到 Electron 的。只靠运行时判断，新代码随时可能把旧模块带进桌面，测试也发现不了。

## 调研

- Strangler Fig（Fowler）：新旧并存期间，新系统有自己的入口，旧系统逐块下线，最后整体移除。
- 分开的 composition root：同一仓库多个产物时，各自有入口、各自构建；VS Code 的 desktop／web 入口与 Electron 官方的 renderer 单独打包都是这样做的。
- 边界检查：dependency-cruiser、eslint-plugin-boundaries、Nx module boundaries 都是「按区划分，禁止某区导入另一区」。业内常把源码检查和产物检查一起用：源码检查报出导入链，产物检查兜住别名、动态导入和副作用导入。
- Branch by Abstraction：跨两边的能力先放到接口后面。本仓库桌面数据层已经是独立的 `src/db/desktop/*`，不需要再加一层。

不采用：
- 只靠运行时 flag 或 `electronDesktopPresent()`：分支错一次旧代码就会跑起来，打包产物也照样带着旧代码。
- 拆 monorepo 或搬进 `src/features`：迁移面太大；实测桌面页面本来就干净，切入口就够了。
- 引入 dependency-cruiser：规则只需要一条「桌面区不得可达旧区」，用现成的 TypeScript 编译器 API 写脚本就够，不新增依赖。

## 决定

1. **桌面单独入口。** 新增 `index.desktop.html → src/main.desktop.tsx → src/DesktopApp.tsx`，只挂桌面路由，不做旧页面回落。`src/main.tsx` 和 `src/App.tsx` 只给 Chromium E2E 用，不再负责桌面。
2. **桌面单独构建。** `vite.desktop.config.ts` 输出 `dist-desktop/`。Electron 的开发态、本地构建和打包态都只加载桌面产物。浏览器打开桌面产物时只显示「请在解语桌面窗口中打开」。
3. **三道门禁，零容忍，不设 allowlist。**
   - 源码门禁 `check:desktop-boundary`：桌面区（桌面入口、`Desktop*` 页面、`src/desktop/**`、`src/db/desktop/**`、`src/hooks/desktop/**`）的可达集不能包含旧区。旧区是 `scripts/legacy-zone.json` 列出的根，以及所有导入它们的模块（自动传染）。
   - 产物门禁：桌面构建结束时，模块里出现 `dexie`、`src/db/engine.ts` 或旧区根模块就失败。
   - 运行时门禁：Electron E2E 断言渲染层 IndexedDB 为空、界面形态为 `desktop`。
4. **前移旧功能。** 一律先进 ADR-0086 白名单，再登记到 `scripts/old-path-exit.record.json`（新增 `surface: "feature"` 条目），按「纯逻辑复用、展示组件复用、存储在 `src/db/desktop` 重写」实现，旧测试的业务断言改写为桌面测试后才算前移完成。不前移的功能交 #328 由用户决定。
5. **退场。** 台账没有未完成条目、#329 完成、#328 已决定后，先打 tag `legacy-web-final`，再一次性删掉旧入口、旧页面、Dexie 实现和 Chromium 门禁。之后要复用旧功能，从 tag 取原实现，仍按第 4 条前移，不在仓库里留归档目录。

## 后果

- Electron 不再加载 Dexie 和旧页面；桌面包变小，桌面问题不会再被旧代码掩盖。
- 共享模块如果后来引到旧区，桌面门禁会失败并给出导入链；修法是拆开那个共享模块，而不是放行。
- 并存期间有两份 Vite 配置和两条 E2E 线，共同部分抽到同一个文件里，Chromium 用例按 #329 每迁一组删一组。
- `npm run dev` 仍是旧网页；桌面开发改用 `npm run dev:desktop`。
- 执行细节和切片见[规格](../execution/specs/desktop-legacy-isolation/requirements.md)。
