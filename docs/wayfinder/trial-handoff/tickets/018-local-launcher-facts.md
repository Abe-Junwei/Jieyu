---
title: 调研：本地启动器方案与本地网址下的浏览器能力
label: wayfinder:research
mode: AFK
status: open
assignee:
blocked_by: []
issue: https://github.com/Abe-Junwei/Jieyu/issues/268
---

# 调研：本地启动器方案与本地网址下的浏览器能力

## Question

收集 2026 年事实：直接用 file:// 打开构建产物是否可行（模块脚本、Worker、IndexedDB、CSP）；把静态服务打成单文件的方案（Node SEA、Deno compile、Bun compile、Go/Rust 小服务器等）的包体与跨平台情况；未签名可执行文件在 macOS/Windows 上的拦截表现与绕过步骤；localhost 下 navigator.storage.persist() 与 IndexedDB 配额、Safari 清除规则；DeepSeek、Qwen（DashScope）API 是否允许浏览器从 localhost 直连（CORS）。产出事实清单，不做决定。
