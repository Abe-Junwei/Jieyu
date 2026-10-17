---
title: 统一模型候选面板 + 模拟模型 + 自测脚本 + 1 条 e2e
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [025,037,043]
issue: https://github.com/Abe-Junwei/Jieyu/issues/306
---

# 统一模型候选面板 + 模拟模型 + 自测脚本 + 1 条 e2e

## Question

- 统一「模型候选」面板：按语段接受/拒绝，阈值批量接受；不覆盖人工内容。
- `model_runs` 落库（拒绝只计数、不存正文；待审候选不落库）。
- 模拟模型 `src/tools/mock-model-server` + conformance 自测脚本。
- 1 条 Electron e2e：配置模拟模型 → 转写 → 接受 → 重载后仍在。

接入转写页 / 标注页的首片范围、写入规则与不在首片的项，见 [#306](https://github.com/Abe-Junwei/Jieyu/issues/306) 正文与 [model-interface-plan.md](../model-interface-plan.md) §8–§9、§13。
