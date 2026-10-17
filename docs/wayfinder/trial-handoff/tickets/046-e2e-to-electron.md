---
title: E2E 从浏览器构建迁到 Electron
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [025]
issue: https://github.com/Abe-Junwei/Jieyu/issues/329
---

# E2E 从浏览器构建迁到 Electron

## Question

[ADR-0064](../../../adr/0064-storage-freeze-until-desktop-opens-real-projects.md) 第 5 条：[#275](https://github.com/Abe-Junwei/Jieyu/issues/275) 的 SQLite 实现能打开真项目后开始，和 [#325](https://github.com/Abe-Junwei/Jieyu/issues/325) 并行，算冻结期内的工作。

要做：

- 用 Playwright 的 Electron 支持（`_electron`）把现有浏览器 E2E 逐组搬到桌面版上跑，场景不减。
- 搬完一组就把这一组设为合并门槛，删掉对应的浏览器用例。
- 全部搬完后，Chromium 浏览器 E2E 不再是合并门槛，同步改 `AGENTS.md`、`copilot-instructions.md`。

不做：删浏览器构建或 Dexie 实现（ADR-0064 第 6 条，还要等 [#326](https://github.com/Abe-Junwei/Jieyu/issues/326) 迁完）。

验收：每搬一组在 Linux、macOS、Windows 上跑绿；全部搬完后 CI 不再跑浏览器 E2E。
