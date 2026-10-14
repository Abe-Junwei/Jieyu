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

已定（[ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0046-desktop-sqlite-project-folder.md) 第 3 条，方案 B）：统一存储接口；桌面实现 = Electron 主进程 SQLite（better-sqlite3），浏览器构建实现 = Dexie；新代码必须走接口。按领域分仓库，暴露业务操作，不做通用表级增删改查；禁止任意表名与泛型查询（2026-10-14）。

**范围改写（用户 2026-10-14）**：本单交付 **ADR-0048 存储接口**，不是「只出草图、不实现」。ADR 须定：
1. 事务怎么表达（对应 ADR-0006；跨仓库写入如何原子）。
2. 归属校验与 ownership 中间件放在哪一侧（主进程 / 渲染进程）。
3. IPC 粒度（一次业务操作一次 IPC，还是可批量）。
4. 异步约定：渲染进程一律 Promise；主进程 better-sqlite3 同步、经 IPC 包装。

样例：已迁的 `aiRuntimeV2TurnStore`（`fa4a4245`）。验收：ADR 合进 main 后你确认；主路线图 §2.1 DoD 第 1 条（SQLite 与 Dexie 双读回）在接口落地后生效。ADR 确认前，[#280](https://github.com/Abe-Junwei/Jieyu/issues/280) 只迁不涉及事务的纯读模块。

