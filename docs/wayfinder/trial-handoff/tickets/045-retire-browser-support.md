---
title: Electron 骨架跑通后：撤掉浏览器支持承诺
label: wayfinder:task
mode: HITL
status: open
assignee:
blocked_by: [026]
issue: https://github.com/Abe-Junwei/Jieyu/issues/328
---

# Electron 骨架跑通后：撤掉浏览器支持承诺

## Question

[ADR-0063](../../../adr/0063-desktop-only-after-electron-skeleton.md)：[#276](https://github.com/Abe-Junwei/Jieyu/issues/276) 通过 [ADR-0059](../../../adr/0059-electron-shell-skeleton.md) 验收后，浏览器构建只留作开发与测试，产品开发全部转到桌面版。

要做：

- 删除 [桌面端浏览器支持策略](../../../architecture/桌面端浏览器支持策略.md)，改掉指向它的链接（`AGENTS.md`、`AI_QUICKSTART.md`、`copilot-instructions.md` 等）。
- `browserslist` 收到 Electron 随附的 Chromium。
- 去掉 Playwright 的 Firefox、WebKit 项目和每晚任务里的这两项。
- 清点只在浏览器构建里有意义的代码，按 [ADR-0064](../../../adr/0064-storage-freeze-until-desktop-opens-real-projects.md) 第 7 条分三类：协作与 Supabase 保留（[ADR-0047](../../../adr/0047-desktop-build-strips-collab-keys-telemetry.md) 编译期剔除，等 C4）；桌面已有替代的（如 keyVault）标为随浏览器构建一起删；没有替代的列清单给用户逐项定。本单不删代码。
- E2E 迁到 Electron 在 [#329](https://github.com/Abe-Junwei/Jieyu/issues/329)，迁完前 Chromium E2E 仍是合并门槛。

不做：删浏览器构建、Dexie 实现和浏览器里的 JYB 导出。它们在 E2E 全部迁到 Electron、[#326](https://github.com/Abe-Junwei/Jieyu/issues/326) 迁完后一起删（ADR-0064 第 6 条）。

验收：`npm run check:docs-governance` 与 `npm run report:docs-link-debt` 无新增断链；`npm run typecheck`；CI 只剩 Chromium 与 Electron 冒烟。
