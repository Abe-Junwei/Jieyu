---
title: 发往云端 AI 前的隐私脱敏：试用版是否默认开 A9
label: wayfinder:grilling
mode: HITL
status: closed (completed)
assignee:
blocked_by: []
issue: https://github.com/Abe-Junwei/Jieyu/issues/283
---

# 发往云端 AI 前的隐私脱敏：试用版是否默认开 A9

## Question

试用者自填 DeepSeek/Qwen 密钥，转写文本会发往云端。[主路线图](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/execution/plans/%E8%A7%A3%E8%AF%AD-%E4%B8%BB%E8%B7%AF%E7%BA%BF%E5%9B%BE-master-roadmap-2026-06-01.md) §3 A9 semantic guard（出站 PII redact）已落地但 flag `aiSemanticGuardEnabled` 默认关。试用版是否默认开？脱敏哪些字段、误伤时怎么办？对试用者的隐私承诺文案怎么写（地图「未定」里的隐私项）？


## Resolution

用户 2026-10-13 定：试用版默认开启 A9 出站脱敏，第一次使用 AI 时向试用者说明。
