---
title: 升级到新版本时怎么不丢数据
label: wayfinder:grilling
mode: HITL
status: closed (completed)
assignee:
blocked_by: [004,009]
issue: https://github.com/Abe-Junwei/Jieyu/issues/271
---

# 升级到新版本时怎么不丢数据

## Question

装新版本后数据目录与数据库升级：升级前是否自动备份（已有 batch4a 迁移快照、batch4b 备份文件夹）、失败能否回退旧版本、版本号如何显示（vite.config 已注入 VITE_APP_VERSION）？发版方式见 [#254](https://github.com/Abe-Junwei/Jieyu/issues/254)，冻结见 [#259](https://github.com/Abe-Junwei/Jieyu/issues/259)。

## Resolution

用户 2026-10-13 定：数据格式升级前自动备份项目文件夹。格式与版本规则见 [#275](https://github.com/Abe-Junwei/Jieyu/issues/275)。
