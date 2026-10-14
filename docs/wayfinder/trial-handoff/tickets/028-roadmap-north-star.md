---
title: 同步主路线图 §1、浏览器支持策略与 D14 文字
label: wayfinder:task
mode: AFK
status: closed (completed)
assignee:
blocked_by: []
issue: https://github.com/Abe-Junwei/Jieyu/issues/278
---

# 同步主路线图 §1、浏览器支持策略与 D14 文字

## Question

起草以下修改交用户确认，只改文档：
- 主路线图 §1 North Star：从「纯 Web 应用、非 WebView、真源 IndexedDB」改为 Electron 桌面版、项目文件夹（SQLite + media/）为真源、浏览器构建只供开发测试（[ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0046-desktop-sqlite-project-folder.md)）。
- 桌面端浏览器支持策略：注明 Electron 内核例外。
- §2.1 DoD：第 1 条改为「经存储接口，SQLite 与 Dexie 两实现均读回校验」；第 4 条验证证据补 Electron 构建与主进程测试。
- §4 适用边界 / §5 对账规则：写明 #250 是当前阶段计划，冲突时以 #250 的新决定为准；完成切片后两边谁更新。
- 长期目的地：写入「从田野到出版的单机闭环」（见地图），#250 = 第一程，下一程父单 = 第二程；语料库建库（B5/B7）在路上。
- rev5 方案 D14：原文保留，补一句「冻结对象 = 项目文件夹格式（SQLite + media/）」。

## Resolution

2026-10-13 完成：主路线图 §1 改为 Electron 桌面应用 + SQLite 项目文件夹，§2.1 DoD 与对账规则已改；rev5 方案 D14 处补注「冻结对象 = 项目文件夹格式（SQLite + media/）」。
