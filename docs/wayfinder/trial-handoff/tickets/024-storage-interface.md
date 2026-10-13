---
title: 存储接口（repository）的形状与边界
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: []
issue: https://github.com/Abe-Junwei/Jieyu/issues/274
---

# 存储接口（repository）的形状与边界

## Question

已定（[ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/docs/wayfinder-trial-map/docs/adr/0046-desktop-sqlite-project-folder.md) 第 3 条，方案 B）：统一存储接口；桌面实现 = Electron 主进程 SQLite（如 better-sqlite3），浏览器构建实现 = Dexie；新代码必须走接口。剩下：接口按领域还是按表切、事务怎么表达（对应 ADR-0006 事务范围）、归属校验与 ownership 中间件放在哪一侧、渲染进程经 IPC 调主进程的粒度。产出接口草图，不实现。

验收口径（主路线图 §2.1 DoD 第 1 条改写）：写路径经存储接口，SQLite 与 Dexie 两种实现都要写入后读回校验。
