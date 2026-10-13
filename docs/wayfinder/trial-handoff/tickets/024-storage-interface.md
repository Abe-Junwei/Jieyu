---
title: 存储层接口：磁盘与 IndexedDB 两种实现共用一套接口
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: []
issue: https://github.com/Abe-Junwei/Jieyu/issues/274
---

# 存储层接口：磁盘与 IndexedDB 两种实现共用一套接口

## Question

用户已定（2026-10-13）：桌面版数据存在磁盘项目文件夹，IndexedDB 只当缓存；浏览器构建保留给开发和测试。现有代码直接用 Dexie（JieyuDexie、事务门面、batch4a 迁移框架）。接口边界画在哪一层（事务门面之上还是之下）？缓存何时写回磁盘、冲突与崩溃时以谁为准？迁移账本怎么同时管两种实现？产出接口草图与边界决定，不实现。
