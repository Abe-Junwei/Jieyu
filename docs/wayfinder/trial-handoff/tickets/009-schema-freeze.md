---
title: 冻结前清单：D14 冻结磁盘项目文件夹格式
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [010,025,030,031,036]
issue: https://github.com/Abe-Junwei/Jieyu/issues/259
---

# 冻结前清单：D14 冻结项目文件夹格式

## Question

已定：用户目前没有需要保留的真实数据，D14 未触发，基线仍可重置。D14 原文保留，补充「冻结对象 = 项目文件夹格式（SQLite + media/）」，在第一个试用版发布之前冻结（[ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0046-desktop-sqlite-project-folder.md) 第 8 条）。剩下：冻结前必须先合进 main 的在途改动（[#260](https://github.com/Abe-Junwei/Jieyu/issues/260)）、冻结前的加法迁移演练（[#281](https://github.com/Abe-Junwei/Jieyu/issues/281)）、版本号、谁确认、现有冻结检查（schemaFreeze.ts）如何扩到 SQLite 格式。

## Related

验证记录已从工作区移除。本单仍只定冻结时机与清单。
