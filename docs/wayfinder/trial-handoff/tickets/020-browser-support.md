---
title: 支持哪些系统版本与 webview 兼容底线
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [002]
issue: https://github.com/Abe-Junwei/Jieyu/issues/270
---

# 支持哪些系统版本与 webview 兼容底线

## Question

桌面版只跑在外壳内核里，不再支持任意浏览器。最低 macOS / Windows 版本是多少？若选 Tauri，WKWebView 与 WebView2 版本随系统走，音频解码、OPFS、Worker 等依赖在哪些版本不可用？现有 [桌面端浏览器支持策略](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/architecture/%E6%A1%8C%E9%9D%A2%E7%AB%AF%E6%B5%8F%E8%A7%88%E5%99%A8%E6%94%AF%E6%8C%81%E7%AD%96%E7%95%A5.md) 和 nightly WebKit e2e 作参考，本单定桌面版的口径。
