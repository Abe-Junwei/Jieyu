---
title: E2E 从浏览器构建迁到 Electron
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: []
execution_gate: M2-complete-for-M3-preparation
issue: https://github.com/Abe-Junwei/Jieyu/issues/329
---

# E2E 从浏览器构建迁到 Electron


<!-- desktop-sqlite-slices:v1:start -->
## 当前可执行切片与关闭条件（2026-10-25 本轮重排）

本单随场景迁移 E2E，不等待 #275 整单关闭，也不在这里删除存储实现。

- [ ] M3-A：准备独立新库/临时夹具和 Electron harness，probe 不写用户所选项目。
- [ ] M3-B：有限 IPC 创建→主进程→关库重开读回；越权/旧句柄无写入，原生模块不进渲染包。
- [ ] M4-C：文件夹→列表→播放→编辑→重启读回，覆盖双进程拒绝；与 #275/#325 联合证明 M4，M1 不替代本项。
- [ ] M5：按图/词典/备注/基础语料/模型等生产域随接替迁场景，业务范围不缩小。
- [ ] 每组 Linux/macOS/Windows 通过后才替换该组浏览器合并门槛；未替代组保持 Chromium 门槛，不长期 skip。
- [ ] 全部迁完再调整全局合并命令与 agent 指引；给 CI、平台证据后关闭。

旧浏览器/Dexie/SQLite 模块退出属于 M7-C，须替代及数据保留证据；#326 已取消，不作为开工或删除前置。


详细前置/验收见[单库切片清单](../../../execution/plans/desktop-project-sqlite-2026-10-25.md#可领取切片与交付顺序2026-10-25-本轮重排)。本轮同步不代表实现完成；下方较早范围保留，冲突以本节为准。
<!-- desktop-sqlite-slices:v1:end -->

## 2026-10-25 已确认范围

M3 准备、M4 起随场景迁移，不等 #275 整单终验；各组多平台通过后才替换旧门槛。M4 前不撤旧代理，M1 不证明桌面产品可用。 依据 [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)、[ADR-0087](../../../adr/0087-project-deletion-retention-and-media-cleanup.md) 和[单库计划](../../../execution/plans/desktop-project-sqlite-2026-10-25.md)。GitHub 已于 2026-10-25 写入当前范围。以下原 Question 留作历史输入，冲突处按本节执行。

## Question

[ADR-0064](../../../adr/0064-storage-freeze-until-desktop-opens-real-projects.md) 第 5 条：[#275](https://github.com/Abe-Junwei/Jieyu/issues/275) 的 SQLite 实现能打开真项目后开始，和 [#325](https://github.com/Abe-Junwei/Jieyu/issues/325) 并行，算冻结期内的工作。

要做：

- 用 Playwright 的 Electron 支持（`_electron`）把现有浏览器 E2E 逐组搬到桌面版上跑，场景不减。
- 搬完一组就把这一组设为合并门槛，删掉对应的浏览器用例。
- 全部搬完后，Chromium 浏览器 E2E 不再是合并门槛，同步改 `AGENTS.md`、`copilot-instructions.md`。

不做：在本单里删浏览器构建或 Dexie。那一步在路线图第 7 步，不再等 #326。本单只替换已经迁完的那组门槛。

验收：每搬一组在 Linux、macOS、Windows 上跑绿；全部搬完后 CI 不再跑浏览器 E2E。
