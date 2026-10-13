---
title: 核对：CSP 是否放行试用者填的云端 AI 地址
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: []
issue: https://github.com/Abe-Junwei/Jieyu/issues/272
---

# 核对：CSP 是否放行试用者填的云端 AI 地址

## Question

index.html 的 CSP 只列已知域，BF3-1 脚本只额外放行用户填的那一个 AI 源（jieyu.csp.aiOrigin）。在盒子里用本地预览实际填 DeepSeek 与 Qwen 的默认地址，验证请求不被 CSP/CORS 拦截，记录结果以及启动器若加 HTTP 头是否与 meta 冲突。只读验证，不改代码。
