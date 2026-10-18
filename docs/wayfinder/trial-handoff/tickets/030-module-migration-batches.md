---
title: 直连 db 的约 297 个模块：分批计划与逐批执行
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [024]
issue: https://github.com/Abe-Junwei/Jieyu/issues/280
---

# 直连 db 的约 297 个模块：分批计划与逐批执行

## Question

按 [ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0046-desktop-sqlite-project-folder.md) 第 3 条与 [#274](https://github.com/Abe-Junwei/Jieyu/issues/274)（ADR-0048）：列出非测试代码里直接 import db / Dexie 的模块，按领域分批，**计划 + 逐批执行**（用户 2026-10-14 定，取代「只出计划」）。

规则：
- 每批一个 PR，迁完跑 `npm run check:direct-db-imports:write-baseline` 下调基线；进度评论记在本 issue。
- ADR-0048 已于 2026-10-15 确认，带事务的写入可以迁；多表写入写成存储接口上的一个操作。
- 关闭条件：`scripts/direct-db-imports-baseline.json` 的 `maxDirectDbModules` 降到 0，或只剩写明白名单的接口实现模块（Dexie / SQLite 适配层本身若必须 import `db`，在本单白名单里写明）。

## 进度

- 2026-10-18 第 1 批：只从 `db` 桶拿类型的模块改从 `db/types` 或 `db/engine` 导入。基线 297 → 129。剩下的是仍有值导入的模块。
