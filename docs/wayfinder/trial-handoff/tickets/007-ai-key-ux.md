---
title: AI 服务设置界面：密钥、服务商与用量
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [026]
execution_gate: outside-m4-whitelist
issue: https://github.com/Abe-Junwei/Jieyu/issues/257
---

# AI 服务设置界面：密钥、服务商与用量

不在 ADR-0086 白名单。M4 通过后也不领取，除非用户把 #257 列入白名单。026 已关闭，不能因此把本单当成前线。

## Question

已定（[ADR-0047](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0047-desktop-build-strips-collab-keys-telemetry.md)）：桌面版密钥存系统钥匙串，AI 请求从主进程发出；keyVault 只留在浏览器构建；偏好备份不含密钥。剩下：试用者如何选 DeepSeek/Qwen、填入并验证密钥可用、失败提示语、如何删除密钥。provider 列表等 AI SDK 迁移落地后定形。

已定：
- 预置 DeepSeek 与 Qwen，另可填自定义 OpenAI 兼容地址；本阶段不接本地模型。
- 显示 AI token 用量；可选设每月上限，超出后停用 AI。
- 试用版本机与云端转写都保留（2026-10-13 21:16 改定）。云端走 OpenAI 兼容转写接口，用试用者自己的密钥。本机走随包 whisper-server（[#303](https://github.com/Abe-Junwei/Jieyu/issues/303)，第一程，挡首发）。设置里两者可选；云端转写需隐私说明，可按项目关闭。

