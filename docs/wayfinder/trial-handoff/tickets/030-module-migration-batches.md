---
title: 直连 db 的约 297 个模块：迁到存储接口的分批计划
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [024]
issue: https://github.com/Abe-Junwei/Jieyu/issues/280
---

# 直连 db 的约 297 个模块：迁到存储接口的分批计划

## Question

按 [ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/docs/wayfinder-trial-map/docs/adr/0046-desktop-sqlite-project-folder.md) 第 3 条，列出所有非测试代码里直接 import db / Dexie 的模块，按领域分批（每批可单独验证），排出顺序与每批验收方式。只出计划，不迁移。
