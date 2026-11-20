---
title: desktop-legacy-isolation design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-20
source_of_truth: desktop-legacy-isolation-spec
depends_on:
  - ./requirements.md
  - ../../../adr/0123-desktop-renderer-build-isolated-from-legacy-web.md
---

# Design — desktop-legacy-isolation

## 1. 成熟方案扫描 / Research

- 仓库既有最相似的模式：`scripts/check-direct-db-imports.mjs`（导入门禁）、`scripts/check-old-path-exit.mjs` + `old-path-exit.record.json`（旧路径台账，#438）、`scripts/desktop-project-flow.mjs`（Electron E2E）、`src/db/desktop/operationContract.test.ts`（桌面数据契约）。
- 同类产品 / 标杆实现：VS Code 的 desktop 与 web 各有入口和构建；Electron 官方建议 renderer 单独打包；Strangler Fig 迁移让新系统先有自己的入口再逐块下线旧系统。
- 业内 best practice：dependency-cruiser、eslint-plugin-boundaries、Nx module boundaries 都按区禁止跨区导入；源码检查配合产物检查（Rollup/rolldown `generateBundle` 读模块列表）兜住别名和动态导入。
- 公认不可行 / 反模式：只靠运行时 flag 隔离（产物仍带旧代码，分支错一次就跑起来）；长期 allowlist（只会越积越多）；新开仓库（共享模块要复制，丢历史和 issue 链接）。
- 潜在的坑：type-only 导入不应计入；`import.meta.glob` 和副作用导入源码分析看不到，由产物门禁兜底；两份 Vite 配置漂移。
- 决定：**适配**。用 TypeScript 编译器 API 写门禁（不加依赖），台账扩展现有记录，构建沿用 Vite。

## 2. 架构选择

- 分区由脚本判定，不搬目录。旧区 = `scripts/legacy-zone.json` 的根 + 所有可达这些根的模块；桌面区 = 桌面入口、`src/pages/Desktop*`、`src/pages/useDesktop*`、`src/desktop/**`、`src/db/desktop/**`、`src/hooks/desktop/**`；其余为共享区。
- 规则只有一条：从桌面区出发（静态 + 动态导入，不含 type-only）的可达集与旧区不相交。零容忍。
- 方案 A（单独入口 + 单独构建）vs 方案 B（同入口 + tree-shaking 靠 `import.meta.env` 常量裁剪）：选 A。B 依赖打包器裁剪行为，壳层副作用导入裁不掉，也不能在源码层报导入链。

## UI 精稿对照

不适用：不新增或改动界面。桌面入口在没有桥接时显示的「请在解语桌面窗口中打开」沿用现有 `unavailable` 界面和文案。

## 3. 落位清单

| 文件 | 职责 | 复杂度估计 |
| --- | --- | --- |
| `scripts/check-desktop-boundary.mjs` | 建导入图、算传染集、报导入链 | < 200 行 |
| `scripts/legacy-zone.json` | 旧区根：`dexie`、`src/db/engine.ts`、`src/main.tsx`、`src/App.tsx`、11 个旧页面、旧壳组件 | 数据 |
| `src/main.desktop.tsx` | i18n、observability、桌面存储安装、错误边界、路由 | < 120 行 |
| `src/DesktopApp.tsx` | 只挂桌面路由与桌面实际用到的壳组件 | < 300 行 / < 12 hooks |
| `vite.shared.ts`、`vite.desktop.config.ts` | 共同配置；桌面配置只写差异，无 PWA | < 120 行 |
| `scripts/vite-plugin-desktop-bundle-guard.ts` | `generateBundle` 检查模块列表并写 `module-manifest.json` | < 80 行 |

约束自查：
- [x] 不引入 `src/features/…`
- [x] 编排层只组装：`DesktopApp` 只装配路由
- [ ] 单 hook 行数与 hooks 数在 S2 实现时复核

## 4. ADR 引用

- 新建 [ADR-0123](../../../adr/0123-desktop-renderer-build-isolated-from-legacy-web.md)；依赖 ADR-0063、0064、0079、0086。

## 5. Feature flag

不启用。隔离是构建结构变化，回滚靠回退 Electron 加载路径（S3），不靠 flag。

## 6. 失败模式 / 兼容性

- 桌面壳漏搬组件：S2 前列出 `App.tsx` 在 `electronDesktopPresent()` 为真时实际渲染的清单，逐项定「搬 / 重写 / 不要」。
- `installSqliteIpcPort` 静态连到 `storagePort → engine`：S2 拆出桌面版本。
- 回滚：S3 之前 Electron 仍加载 `dist/`，各片可单独回退。
- 旧浏览器数据：不迁移（ADR-0064、#326 已取消）。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 门禁单测 | `npx vitest run scripts/check-desktop-boundary.test.ts scripts/check-old-path-exit.test.ts` | all pass |
| 源码门禁 | `npm run check:desktop-boundary` | OK |
| 产物门禁 | `npm run build:desktop` | 成功，清单无旧区模块 |
| Electron E2E | `npm run test:e2e:desktop-project` | 三平台 green |
| Chromium E2E（S8 前） | `npm run test:e2e:chromium` | green |
| 结构守卫 | `npm run check:architecture-guard` | OK |
| 文档 | `npm run check:docs-governance` | OK |
