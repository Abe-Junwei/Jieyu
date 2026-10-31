---
title: 主进程本机 HTTP 模型宿主（ModelHost）
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [026, 036]
execution_gate: second-stage
issue: https://github.com/Abe-Junwei/Jieyu/issues/305
---

# 主进程本机 HTTP 模型宿主（ModelHost）


## 当前排期覆盖（2026-10-30，ADR-0098）

模型下载、持久管理、转码和随包分发移至第二程 #285，当前不做，不作为第一程 #250、单库 #275 或发布检查 #282 的前置。已完成的模拟/真实引擎开发闭环与人工采纳保留；默认关闭，不等于随包能力验收。下文较早的“挡首发”及整单依赖在这些余项上作废，见 [ADR-0098](../../../adr/0098-model-delivery-followups-in-second-stage.md)。

<!-- desktop-sqlite-slices:v1:start -->
## 当前可执行切片与关闭条件（2026-10-25 本轮重排）

归 M5-F：M4-C 后按接口就绪推进，不等 #275/#325 全关闭。

- [x] 先完成声明/本机 HTTP/大小及响应校验、取消/超时/IPC 的宿主合同，用模拟服务验证。不接真实引擎，不开候选面板，不写 model_runs。
- [x] #303 以当前平台开发 CLI 接真实引擎；#306 同一接口接候选/采纳，Electron 合成输入重开通过。随包交付和持久模型管理仍未完成。
- [x] 启动任务时保存目标凭据，结果回来不能换取最新代际；业务提交层在事务内校验，宿主不读运行时私有字段。N1 迟到映射/正文/会话和删除恢复测试已通过。
- [x] 与 #306 在新库重开核对运行和接受结果，领域/N1 覆盖删除恢复后的迟到结果，真实引擎合成采纳已读回；未冒充真实平台交付。

模型宿主不自行开表名事务写语言行。#304 已关闭的 ADR 输入保留，#275 接本项集成证据。


详细前置/验收见[单库切片清单](../../../execution/plans/desktop-project-sqlite-2026-10-25.md#可领取切片与交付顺序2026-10-25-本轮重排)。本轮同步不代表实现完成；下方较早范围保留，冲突以本节为准。
<!-- desktop-sqlite-slices:v1:end -->

## 2026-10-25 已确认范围

M4 后按白名单开工，不等 #275/#325 整单关闭；任务取消/迟到结果沿领域写门禁处理，不读智能体运行时私有字段。本机转写集成后回归删除中的可控任务场景。 依据 [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)、[ADR-0087](../../../adr/0087-project-deletion-retention-and-media-cleanup.md) 和[单库计划](../../../execution/plans/desktop-project-sqlite-2026-10-25.md)。GitHub 已于 2026-10-25 写入当前范围。以下原 Question 留作历史输入，冲突处按本节执行。

## Question

Electron 主进程 ModelHost：读声明文件、本机 HTTP 传输、令牌存钥匙串（可选，缺令牌时警告）、回环判定、zod 校验与上限、切块与时间平移、超时与中止、IPC、设置页「模型」栏。第一个实现 = [#303](https://github.com/Abe-Junwei/Jieyu/issues/303)。方案见 [model-interface-plan.md](../model-interface-plan.md) §10。

前置已完成：whisper-server 默认只监听 127.0.0.1 + Host 头校验，2026-10-14 合进 main（`bb5fb2a4`）。

以后再做（用户 2026-10-14）：
- 引入第二个大体积引擎（需带 Python / ONNX 运行时、数百 MB）时，改成可下载的模型包（引擎 + 权重 + `jieyu-model.json`）；首发 `whisper-cli` 随安装包。
- 试用反馈 Windows 本机转写太慢时，再加 Vulkan 版 `whisper-cli`（启动失败退回 CPU 版）。
