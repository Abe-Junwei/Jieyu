---
title: 试用者填 API 密钥的界面与存储安全口径
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [018]
issue: https://github.com/Abe-Junwei/Jieyu/issues/257
---

# 试用者填 API 密钥的界面与存储安全口径

## Question

网页版密钥只能存在浏览器里。已有 keyVault（src/ai/config/keyVault.ts，WebCrypto 加密存 localStorage，明文存储会剥离密钥）和设置弹窗。浏览器内加密存储是否够用（密钥派生材料也在本机，防的是什么）？公用电脑上如何清除？试用者如何选 DeepSeek/Qwen 并验证密钥可用？密钥是否随项目包导出（应否）？失败时提示语怎么写？需等 AI SDK 迁移落地后 provider 列表定形。
