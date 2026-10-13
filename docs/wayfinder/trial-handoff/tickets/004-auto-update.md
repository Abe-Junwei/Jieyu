---
title: 试用版如何升级：自动更新还是手动下载
label: wayfinder:grilling
mode: HITL
status: closed (completed)
assignee:
blocked_by: [001,003]
issue: https://github.com/Abe-Junwei/Jieyu/issues/254
---

# 试用版如何升级：自动更新还是手动下载

## Question

试用期间会多次发版。用外壳自带的自动更新（需签名，GitHub Releases 作更新源），还是让试用者手动下载新安装包？是否提示新版本？数据不丢的部分见 [#271](https://github.com/Abe-Junwei/Jieyu/issues/271)。

## Resolution

用户 2026-10-13 定：electron-updater 走 GitHub Releases 自动更新。落地见 [#277](https://github.com/Abe-Junwei/Jieyu/issues/277)。
