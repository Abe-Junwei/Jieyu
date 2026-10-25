---
title: 改用 GPL-3.0-or-later：许可证切换、依赖兼容核对、第三方许可清单、中文隐私说明
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: []
execution_gate: M4
issue: https://github.com/Abe-Junwei/Jieyu/issues/307
---

# 改用 GPL-3.0-or-later

与发布流水线 #277 同期，安装包对外发出前完成。M1–M3 不领取。这不是新功能白名单。

## Question

用户 2026-10-13 拍板：解语从 ISC 改为 GPL-3.0-or-later（著作权人：沂南灵创技术服务中心）。本单覆盖：
- 改 LICENSE、package.json `license` 字段与源文件声明；
- 核对全部依赖（含随包 LGPL ffmpeg、随包 `whisper-cli`（MIT）、Whisper 模型权重（MIT，应用内下载）、whisper-server、Electron）与 GPL-3.0-or-later 的兼容性；
- 安装包内附第三方许可清单；
- 中文隐私说明（本地存储、云端 AI/转写发送什么）。
