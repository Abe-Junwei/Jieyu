---
title: 诊断与反馈：反馈邮件按钮、诊断包导出、Sentry 同意弹窗与接入
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [026]
execution_gate: M4
issue: https://github.com/Abe-Junwei/Jieyu/issues/312
---

# 诊断与反馈

## 2026-10-25 已确认范围

M4 后按白名单开工，不等 #275/#325 整单终验；反馈/诊断交付由本单与 #282 验收，不作为 #275 的发布能力实现。 依据 [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)、[ADR-0087](../../../adr/0087-project-deletion-retention-and-media-cleanup.md) 和[单库计划](../../../execution/plans/desktop-project-sqlite-2026-10-25.md)。GitHub 已于 2026-10-25 写入当前范围。以下原 Question 留作历史输入，冲突处按本节执行。

## Question

三项已拍板、原挂单已关闭，由本单落地（用户 2026-10-14 定）：
- 反馈按钮：应用内按钮打开邮件，预填应用版本、系统与脱敏日志（原 [#264](https://github.com/Abe-Junwei/Jieyu/issues/264)）。
- 诊断包导出：供数据恢复时判断能否从快照恢复；用户自己从快照恢复（原 [#269](https://github.com/Abe-Junwei/Jieyu/issues/269)）。
- Sentry：首启同意弹窗、默认关；`@sentry/electron` 接渲染与主进程；强制 `sendDefaultPii=false`、字段白名单；用用户本人的 Sentry 账户与 DSN（原 [#261](https://github.com/Abe-Junwei/Jieyu/issues/261)，[ADR-0047](../../../adr/0047-desktop-build-strips-collab-keys-telemetry.md)）。

三项共用同一套脱敏日志。反馈按钮与诊断包导出挡首个试用版，作为 [#282](https://github.com/Abe-Junwei/Jieyu/issues/282)「不丢数据」硬门槛的验收项；Sentry 不挡。
