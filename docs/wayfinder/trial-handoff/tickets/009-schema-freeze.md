---
title: 冻结 schema 的时机与冻结前清单
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [010]
issue: https://github.com/Abe-Junwei/Jieyu/issues/259
---

# 冻结 schema 的时机与冻结前清单

## Question

按 D14，交给非开发者即冻结。冻结检查已存在（schemaFreeze.ts、check:schema-freeze、schema:freeze-record）。冻结前哪些在途的结构改动必须先合进 main（AI 运行时 v2 的聊天/审批表、p2-3 索引等）？冻结在哪个版本号、由谁确认？

## Related

已有冻结操作说明：[batch4a 验证记录 · 冻结点操作（D14）](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/execution/release-gates/project-data-batch4a-migration-framework-verification-2026-10-09.md)。本单只定时机与清单。
