---
title: AI 服务设置界面：密钥、服务商与用量
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [026]
issue: https://github.com/Abe-Junwei/Jieyu/issues/257
---

# AI 服务设置界面：密钥、服务商与用量

## Question

已定（[ADR-0047](https://github.com/Abe-Junwei/Jieyu/blob/docs/wayfinder-trial-map/docs/adr/0047-desktop-build-strips-collab-keys-telemetry.md)）：桌面版密钥存系统钥匙串，AI 请求从主进程发出；keyVault 只留在浏览器构建；偏好备份不含密钥。剩下：试用者如何选 DeepSeek/Qwen、填入并验证密钥可用、失败提示语、如何删除密钥。provider 列表等 AI SDK 迁移落地后定形。

已定：
- 预置 DeepSeek 与 Qwen，另可填自定义 OpenAI 兼容地址；本阶段不接本地模型。
- 显示 AI token 用量；可选设每月上限，超出后停用 AI。
- 试用版转写（Whisper）走云端 OpenAI 兼容转写接口，用试用者自己的密钥；本地 Whisper 放第二程。

