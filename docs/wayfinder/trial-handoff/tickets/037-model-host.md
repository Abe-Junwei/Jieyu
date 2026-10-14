---
title: 主进程本机 HTTP 模型宿主（ModelHost）
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [026,036]
issue: https://github.com/Abe-Junwei/Jieyu/issues/305
---

# 主进程本机 HTTP 模型宿主（ModelHost）

## Question

Electron 主进程 ModelHost：读声明文件、本机 HTTP 传输、令牌存钥匙串（可选，缺令牌时警告）、回环判定、zod 校验与上限、切块与时间平移、超时与中止、IPC、设置页「模型」栏。第一个实现 = [#303](https://github.com/Abe-Junwei/Jieyu/issues/303)。方案见 [model-interface-plan.md](../model-interface-plan.md) §10。

前置：whisper-server 只监听 127.0.0.1 的修复（`fix/whisper-server-bind-localhost`）评审后合进 main。

以后再做（用户 2026-10-14）：
- 引入第二个大体积引擎（需带 Python / ONNX 运行时、数百 MB）时，改成可下载的模型包（引擎 + 权重 + `jieyu-model.json`）；首发 `whisper-cli` 随安装包。
- 试用反馈 Windows 本机转写太慢时，再加 Vulkan 版 `whisper-cli`（启动失败退回 CPU 版）。
