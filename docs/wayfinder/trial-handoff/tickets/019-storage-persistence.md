---
title: 桌面版数据丢失风险与持久化策略
label: wayfinder:grilling
mode: HITL
status: closed (completed)
assignee:
blocked_by: [002]
issue: https://github.com/Abe-Junwei/Jieyu/issues/269
---

# 桌面版数据丢失风险与持久化策略

## Question

桌面外壳里数据仍在 webview 的 IndexedDB（或改存磁盘文件）。外壳的数据目录在哪、卸载/重装/升级会不会清掉、是否会被系统清理？是否仍需 `persist()`、自动备份到磁盘文件夹（已有 batch4b T44：`storageDurability`、`backupFolderService`）？是否借外壳直接把项目存成磁盘文件？对试用者怎么讲清风险？事实见 [#252](https://github.com/Abe-Junwei/Jieyu/issues/252)。

## Resolution

用户 2026-10-13 定：数据存在磁盘项目文件夹（解包 JYM 结构），IndexedDB 只当缓存。见 [#274](https://github.com/Abe-Junwei/Jieyu/issues/274)、[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)。
