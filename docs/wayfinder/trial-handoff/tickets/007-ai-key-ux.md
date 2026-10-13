---
title: 试用者填 API 密钥的界面与存储安全口径
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [002]
issue: https://github.com/Abe-Junwei/Jieyu/issues/257
---

# 试用者填 API 密钥的界面与存储安全口径

## Question

桌面版里密钥存哪：沿用 keyVault（src/ai/config/keyVault.ts，WebCrypto 加密存 localStorage）还是改用系统钥匙串（macOS Keychain / Windows 凭据管理器，经外壳接口）？各防的是什么？试用者如何选 DeepSeek/Qwen 并验证密钥可用？密钥不随项目包导出（JYB 已有 REV5-N1 规则）。失败提示语怎么写？provider 列表等 AI SDK 迁移落地后定形。外壳能力见 [#252](https://github.com/Abe-Junwei/Jieyu/issues/252)。
