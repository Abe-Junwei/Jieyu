---
title: desktop-legacy-isolation requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-11-20
source_of_truth: desktop-legacy-isolation-spec
---

# Requirements — desktop-legacy-isolation

决定见 [ADR-0131](../../../adr/0131-desktop-renderer-build-isolated-from-legacy-web.md)，并沿用 [ADR-0123](../../../adr/0123-dev-server-shows-the-desktop-shell.md)。导入图基线：`2017062b`。

## 1. What & Why

- **要做什么**：先拆掉两条混合边，再让桌面渲染层占用默认入口和构建、旧网页改名；三道门禁零容忍；旧功能按台账前移；#329 完成后删旧网页。
- **为什么现在做**：Electron 加载的 `src/main.tsx` 静态就能到达 `db/engine`；`storagePort` 默认绑定 Dexie，`lexiconLiftImport` 把解析和 Dexie 写入混在一起，桌面目录经由它们到达 Dexie。
- **不做什么**：不拆仓库、不搬 `src/features`；不迁移旧浏览器数据（#326 已取消）；不加产品功能；S8 前不删旧代码。不改 1b–7 和 #285 的产品顺序，不把第二程功能提前。不改写 ADR-0063，不改带日期的变更记录。

## 2. 用户场景

1. 开发者在桌面区误导入会到达 Dexie 的模块：`check:all` 失败，并打印导入链。
2. 开发者要把旧词典的某个功能搬到桌面：先进 ADR-0086 白名单，再登记台账，桌面测试替代旧测试后关账。
3. 旧网页删除后要找回旧实现：按台账 `paths` 执行 `git show legacy-web-final:<path>`。

## 3. 验收标准

- [ ] `parseLiftXml` 所在模块不到达 `storagePort*`。Dexie 实现在 `src/db/dexieStoragePort.ts`。`storagePort.ts` 不导入 `engine`，未安装时抛错。
- [ ] `check:desktop-boundary` 在接进 `check:all` 的那次提交上实测为 0；在桌面区样例导入 `db/engine` 时失败，并打印导入链（单测）。
- [ ] 同一个 PR 内：`index.html` 改为桌面入口，`App.tsx` 去掉桌面分支。`test:e2e:desktop-project` 在 Ubuntu CI 与本机 macOS 通过，`test:e2e:chromium` 经 `preview:legacy` 通过。`desktop:smoke` 不作为入口切换的证据。
- [ ] `npm run dev` 与 Electron 开发态加载桌面入口；浏览器没有桥接时只显示提示（ADR-0123）。`dev:legacy` 的 `/` 打开 `legacy/index.html`，模块脚本是 `../src/main.tsx`，静态文件仍来自仓库 `public/`。两份 `#jieyu-csp` 文本相同。
- [ ] `npm run build` 产出的 `dist/` 里没有 `dexie`、`src/db/engine.ts`、旧区根模块和 service worker；出现时构建失败。旧网页构建不往 `dist/` 写文件。
- [ ] `test:e2e:desktop-project` 在开发服务器里断言 `indexedDB.databases()` 为空、界面形态为 `desktop`。打包后的 `dist/` 由产物门禁检查。平台是 Ubuntu CI 加本机 macOS。
- [ ] `src/main.tsx` 先安装 Dexie，SQLite 开关打开时覆盖它。`src/main.desktop.tsx` 不安装 Dexie；IPC 只在 ADR-0079 开关打开时安装。
- [ ] `old-path-exit.record.json` 有 `features` 数组，10 个旧路由页面都已登记；`check:old-path-exit` 校验 `ported`/`dropped` 字段。
- [ ] S0b 起，主路线图登记本工程轨，且 1b–7 的顺序还在。S5 起，验证命令和入口切换一致。S7 每迁完一组，进度点名该组。S8 起，仍在描述现状的路线图句子改为浏览器构建已删，并写有第二程开工约束。

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| 混合边 | `src/utils/lexiconLiftImport.ts`、`src/db/desktop/foreignImport.ts`、`src/db/storagePort.ts`、`src/db/dexieStoragePort.ts`、`src/db/storagePortErrors.ts`、`src/db/sqliteStoragePort.ts` | 拆分 |
| 桌面入口 | `index.html`、`src/main.desktop.tsx`、`src/DesktopApp.tsx` | 新增 / 改指向 |
| 旧入口 | `legacy/index.html`、`src/main.tsx`、`src/App.tsx`、`src/components/DesktopRoute.tsx` | 独立根目录 / 去桌面分支 |
| 构建 | `vite.config.ts`（桌面）、`vite.legacy.config.ts`（PWA）、`vite.shared.ts`、`package.json` | 新增 / 修改 |
| E2E 接线 | `playwright.config.ts`、`playwright.session-sidecar.config.ts`、`.github/workflows/e2e-pr.yml`、`electron-smoke.yml` | 改用旧网页构建 / 加断言 |
| 门禁 | `scripts/check-desktop-boundary.mjs`、`scripts/legacy-zone.json`、`scripts/check-legacy-html-csp.mjs`、`scripts/vite-plugin-desktop-bundle-guard.ts` | 新增 |
| 台账 | `scripts/old-path-exit.record.json`、`scripts/check-old-path-exit.mjs` | 扩展 |
| 文档 | `AI_QUICKSTART.md`、`copilot-instructions.md`、`AGENTS.md`、主路线图、单库计划、试用地图、`docs/architecture/offline-pwa-first-visit-expectations.md` | 按 S0b / S5 / S7 / S8 分次改 |

## 5. 已知风险与依赖

- 上游：ADR-0063、0064 §5–§7、0079、0086 白名单、0123；#329、#328。
- `storagePort` 未安装即抛错以后，依赖默认 Dexie 的 vitest 需要在 setup 里安装 `src/db/dexieStoragePort.ts`。
- `App.tsx` 1098 行，拆的时候可能漏掉桌面实际用到的壳组件。S3a 先列出「不要」项的文件路径，S3b 再补进 `legacy-zone.json`。
