---
title: 调研：Tauri 2 与 Electron 跑现有 Vite 应用的可行性
label: wayfinder:research
mode: AFK
status: open
assignee:
blocked_by: []
---

# 调研：Tauri 2 与 Electron 跑现有 Vite 应用的可行性

## Question

在 Tauri 2（macOS WKWebView / Windows WebView2）与 Electron（Chromium）中运行当前构建，哪些能力会出问题：IndexedDB 配额与持久化、navigator.storage.persist、WebGPU/WebLLM、AudioContext 解码、严格 CSP（zod jitless）、Worker、文件选择与拖放、大文件。各自代码签名/公证/自动更新的官方支持现状（2026）。产出事实清单，不做决定。
