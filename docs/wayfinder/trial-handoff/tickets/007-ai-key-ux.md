---
title: 试用者填 API 密钥的界面
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [026]
issue: https://github.com/Abe-Junwei/Jieyu/issues/257
---

# 试用者填 API 密钥的界面

## Question

已定（[ADR-0047](https://github.com/Abe-Junwei/Jieyu/blob/docs/wayfinder-trial-map/docs/adr/0047-desktop-build-strips-collab-keys-telemetry.md)）：桌面版密钥存系统钥匙串，AI 请求从主进程发出；keyVault 只留在浏览器构建；偏好备份不含密钥。剩下：试用者如何选 DeepSeek/Qwen、填入并验证密钥可用、失败提示语、如何删除密钥。provider 列表等 AI SDK 迁移落地后定形。
