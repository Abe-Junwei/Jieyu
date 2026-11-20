---
title: desktop-legacy-isolation requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-11-20
source_of_truth: desktop-legacy-isolation-spec
---

# Requirements — desktop-legacy-isolation

决定见 [ADR-0130](../../../adr/0130-desktop-renderer-build-isolated-from-legacy-web.md)。

## 1. What & Why

- **要做什么**：桌面渲染层单独入口、单独构建，用源码、产物、运行时三道门禁保证 Electron 里没有旧网页和 Dexie；旧功能按台账前移；#329 完成后删旧网页。
- **为什么现在做**：实测 `src/main.tsx` 静态导入就引到 `db/engine`（Dexie），动态导入可达 11 个旧页面；Electron 加载的正是这份入口。桌面页面本身已经干净，现在锁住成本最低。
- **不做什么**：不拆仓库、不搬 `src/features`；不迁旧浏览器用户数据（#326 已取消）；不新增产品功能；S8 之前不删旧代码。

## 2. 用户场景

1. 开发者在桌面页面里误导入一个会引到 Dexie 的模块，PR 的 `check:all` 失败并打印导入链。
2. 开发者要把旧词典的某功能搬到桌面：先进 ADR-0086 白名单，再登记台账，按流程实现，旧测试的业务断言改写为桌面测试后关账。
3. 旧网页删除后要找回某个旧实现：按台账的 `paths` 用 `git show legacy-web-final:<path>` 取回。

## 3. 验收标准

- [ ] `npm run check:desktop-boundary` 在主干通过；在桌面区导入 `src/db/engine.ts` 的样例上失败并给出导入链（脚本单测）。
- [ ] `npm run build:desktop` 产出 `dist-desktop/`，模块清单里没有 `dexie`、`src/db/engine.ts` 和旧区根模块；违反时构建失败。
- [ ] Electron 开发态、本地构建、打包态都只加载桌面产物；`test:e2e:desktop-project` 断言 `indexedDB.databases()` 为空、界面形态为 `desktop`，三平台通过。
- [ ] 浏览器打开桌面产物只显示「请在解语桌面窗口中打开」，不出现旧页面。
- [ ] `check:old-path-exit` 校验 `feature` 条目：`ported` 有存在的 `replacement` 与 `desktopTests`，`dropped` 有 `decision`。
- [ ] 门禁零容忍，仓库里没有 allowlist 文件。

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| 启动入口 | `index.desktop.html`、`src/main.desktop.tsx`、`src/DesktopApp.tsx` | 新增 |
| 旧壳 | `src/main.tsx`、`src/App.tsx`、`src/components/DesktopRoute.tsx` | 去掉桌面分支 |
| 存储安装 | `src/db/installSqliteIpcPort.ts` | 拆出不含 Dexie 的桌面版本 |
| 构建 | `vite.desktop.config.ts`、`vite.config.ts`（抽共同部分）、`package.json` | 新增 / 修改 |
| Electron | `electron/main.ts`、打包配置 | 修改加载路径 |
| 门禁脚本 | `scripts/check-desktop-boundary.mjs`、`scripts/legacy-zone.json`、`scripts/vite-plugin-desktop-bundle-guard.ts` | 新增 |
| 台账 | `scripts/old-path-exit.record.json`、`scripts/check-old-path-exit.mjs` | 扩展 |
| 测试 / CI | `tests/e2e-desktop/**`、`.github/workflows/electron-smoke.yml` | 修改 |
| 文档 | `AI_QUICKSTART.md`、`copilot-instructions.md` 开发命令 | 修改 |

## 5. 已知风险与依赖

- 上游：ADR-0063、ADR-0064 §5–§7、ADR-0079、ADR-0086 白名单、#329、#328。
- `App.tsx` 1086 行，搬桌面壳时容易漏掉桌面实际渲染的组件（toast、错误边界、设置）。
- 并存期两份 Vite 配置可能漂移。
