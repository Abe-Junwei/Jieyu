---
title: 试用者填 API 密钥的界面与存储安全口径
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [002]
---

# 试用者填 API 密钥的界面与存储安全口径

## Question

已有 keyVault（src/ai/config/keyVault.ts，WebCrypto 加密存 localStorage，明文存储会剥离密钥）和设置弹窗。桌面版是否改用系统钥匙串（Keychain/Credential Manager）？试用者如何选 DeepSeek/Qwen 并验证密钥可用？密钥是否随项目包导出（应否）？失败时提示语怎么写？需等 AI SDK 迁移落地后 provider 列表定形。
