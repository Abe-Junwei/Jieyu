---
title: 调研：Electron 下的 e2e 冒烟与 CI 跑法
label: wayfinder:research
mode: AFK
status: open
assignee:
blocked_by: []
issue: https://github.com/Abe-Junwei/Jieyu/issues/284
---

# 调研：Electron 下的 e2e 冒烟与 CI 跑法

## Question

[主路线图](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/execution/plans/%E8%A7%A3%E8%AF%AD-%E4%B8%BB%E8%B7%AF%E7%BA%BF%E5%9B%BE-master-roadmap-2026-06-01.md) §2.1 DoD 第 4 条与 C1 都依赖 `test:e2e:chromium`。收集 2026 年事实：Playwright `_electron` 的现状与限制、在 GitHub Actions 的 macOS/Windows/Linux 上跑 Electron 冒烟的做法（无头、xvfb）、主进程测试方式、耗时。产出事实清单供 #276 骨架验收。不做决定。
