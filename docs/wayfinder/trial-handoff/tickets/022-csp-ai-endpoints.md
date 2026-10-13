---
title: 核对：CSP 是否放行试用者填的云端 AI 地址
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [001]
issue: https://github.com/Abe-Junwei/Jieyu/issues/272
---

# 核对：CSP 是否放行试用者填的云端 AI 地址

## Question

index.html 的 CSP 只列已知域，BF3-1 只额外放行用户填的那一个 AI 源（jieyu.csp.aiOrigin）。按 [#251](https://github.com/Abe-Junwei/Jieyu/issues/251) 选定的外壳，核对外壳自己的 CSP 配置（Tauri `security.csp` 或 Electron 头）与 meta 是否冲突，并实际填 DeepSeek 与 Qwen 默认地址验证不被 CSP/CORS 拦截。只读验证，不改代码。
