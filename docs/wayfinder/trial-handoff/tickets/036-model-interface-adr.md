---
title: 模型接口 ADR：转写能力、合同 v1、安全规则、model_runs 表形状
label: wayfinder:task
mode: HITL
status: open
assignee:
blocked_by: []
issue: https://github.com/Abe-Junwei/Jieyu/issues/304
---

# 模型接口 ADR：转写能力、合同 v1、安全规则、model_runs 表形状

## Question

写一份 ADR，只含 `transcribe` 一种能力（对齐以后再说）：
- 合同 v1：时间一律用秒、从原始录音开头算；音频只用 multipart 上传，不传本机路径；长录音由解语切块再平移回原时间；单一协议版本号与兼容规则；错误码。
- 安全：只限回环 + Host 校验 + 回环 IP 判定 + 严格校验响应 + 大小上限；一次性令牌可选，服务不支持令牌也能接，只显示警告。
- 声明文件 `jieyu-model.json`（SPDX 许可证、id 规则、书写系统映射）。
- `model_runs` 表形状：每次运行一行，语段 `provenance.params.modelRunId` 指向它；结果一律是候选，由人接受或拒绝。

本单是 D14 冻结的硬依赖：`model_runs` 表与 `provenance` 枚举 / `params` 键名随冻结一起定（[#259](https://github.com/Abe-Junwei/Jieyu/issues/259)、[#275](https://github.com/Abe-Junwei/Jieyu/issues/275) 均依赖本单）。方案见 [model-interface-plan.md](../model-interface-plan.md) §4–§7。
