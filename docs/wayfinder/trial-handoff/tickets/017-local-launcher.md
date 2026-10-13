---
title: 本地启动方式：试用者不装开发工具怎么把解语跑起来
label: wayfinder:grilling
mode: HITL
status: closed (not planned)
assignee:
blocked_by: [018]
issue: https://github.com/Abe-Junwei/Jieyu/issues/267
---

# 本地启动方式：试用者不装开发工具怎么把解语跑起来

## Question

解语在试用者自己电脑上运行、浏览器打开本地网址，不设服务器。Mac 与 Windows 上怎么零开发工具启动：双击启动器、打成单个可执行文件在 localhost 上提供构建产物，还是直接打开 dist 文件？未签名的可执行文件会被 Gatekeeper/SmartScreen 拦截，是否因此需要签名（已关闭的「签名与公证」若需要则重开）？依赖 018 的事实。

## Resolution

用户 2026-10-13 19:11 改为桌面外壳，本地启动器路线作废；启动方式并入 [#251](https://github.com/Abe-Junwei/Jieyu/issues/251)。
