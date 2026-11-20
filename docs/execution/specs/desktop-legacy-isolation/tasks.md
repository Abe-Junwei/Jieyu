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

每片一个 PR。顺序：S0 → S1 → S2 → S3 → S4；S5、S6 在 S3 后可并行；S7 在 S4、S6 后持续；S8 最后。

## Implementation tasks

- [x] S0 决策落档：ADR-0130 + 本规格 → 验证：`npm run check:docs-governance`
- [ ] S1 源码门禁：`scripts/check-desktop-boundary.mjs`（+ `.test.ts`）、`scripts/legacy-zone.json`，接入 `check:all`；当前桌面区（页面、`src/desktop`、`src/db/desktop`、`src/hooks/desktop`）应为 0 违规 → 验证：脚本单测（造桌面模块导入 `db/engine` 应失败）+ `npm run check:desktop-boundary`
- [ ] S2a 列出 `App.tsx` 在桌面下实际渲染的组件与 effect，逐项定「搬 / 重写 / 不要」，写进本文件 → 验证：评审
- [ ] S2b 拆出不含 Dexie 的桌面存储安装（`installSqliteIpcPort`） → 验证：`check:desktop-boundary` + 对应 vitest
- [ ] S2c `index.desktop.html`、`src/main.desktop.tsx`、`src/DesktopApp.tsx`，并纳入桌面区 → 验证：`npm run typecheck`、`check:desktop-boundary`、`DesktopApp` 路由单测
- [ ] S2d `App.tsx`、`DesktopRoute` 去掉桌面分支与 `electronDesktopPresent()` 判断 → 验证：`npm run test:e2e:chromium`
- [ ] S3 `vite.shared.ts` + `vite.desktop.config.ts`、`build:desktop`、`dev:desktop`；`electron/main.ts` 与打包配置只加载 `dist-desktop/` → 验证：`npm run build:desktop`、`npm run desktop:smoke`、`npm run test:e2e:desktop-project`
- [ ] S4 产物门禁插件 + 模块清单；桌面 E2E 加 IndexedDB 为空、形态为 `desktop` 断言；`electron-smoke.yml` 改跑桌面构建 → 验证：临时分支故意违规三道门禁都红，主干全绿
- [ ] S5 开发命令与文档：`AI_QUICKSTART.md`、`copilot-instructions.md` 写明 `dev` 是旧网页、`dev:desktop` 是桌面 → 验证：`npm run check:docs-governance`
- [ ] S6 台账：`old-path-exit.record.json` 增加 `surface: "feature"`（`status`、`oldTests`、`desktopTests`、`decision`），校验规则进 `check-old-path-exit.mjs` 并新增其单测；按功能登记 11 个旧页面 → 验证：`npx vitest run scripts/check-old-path-exit.test.ts`
- [ ] S7 前移循环：每个功能先进 ADR-0086 白名单，再按 ADR-0130 第 4 条实现与关账；E2E 按 #329 分组迁到 Electron → 验证：每片 `check:desktop-boundary`、`test:e2e:desktop-project`
- [ ] S8 退场：前提为台账无 `planned`/`in-progress`、#329 完成、#328 已决定；打 tag `legacy-web-final` 后删旧入口、旧页面、Dexie、Chromium 门禁，`dist-desktop` 改回 `dist`，更新 AGENTS.md / copilot-instructions / AI_QUICKSTART → 验证：typecheck、全量 vitest、三平台桌面 E2E、`check:all`

## Pre-merge gates

- [ ] `npm run typecheck`
- [ ] 触及域的 `vitest`（S1、S6 新增的两个门禁脚本单测）
- [ ] 触及壳层 / 路由：`npm run test:e2e:chromium` + `npm run test:e2e:desktop-project`
- [ ] `npm run check:architecture-guard`
- [ ] 触及 docs：`npm run check:docs-governance`
- [x] 不适用：不启用 feature flag

## Post-merge

- [ ] S8 完成后删除 `docs/execution/specs/desktop-legacy-isolation/`
