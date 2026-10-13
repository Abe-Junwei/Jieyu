---
title: 调研：Tauri 2 与 Electron 跑现有 Vite 应用的可行性
label: wayfinder:research
mode: AFK
status: open
assignee:
blocked_by: []
issue: https://github.com/Abe-Junwei/Jieyu/issues/252
---

# 调研：Tauri 2 与 Electron 跑现有 Vite 应用的可行性

## Question

收集 2026 年事实，不做决定（输入：盒子 `/workspace/jieyu-review/RESEARCH_DISTRIBUTION.md`；吸收已关闭的 [#268](https://github.com/Abe-Junwei/Jieyu/issues/268)）：
- 运行现有构建：Tauri 2（macOS WKWebView / Windows WebView2）与 Electron（Chromium）下的 IndexedDB 配额与持久化、是否会被系统清理、数据目录位置、`navigator.storage.persist()`；AudioContext 解码、Worker、严格 CSP（zod jitless）、文件选择与拖放、大文件。
- Windows 中文输入法：WebView2 的已知问题报告与 Electron 对照。
- 自动更新：Tauri updater、electron-updater 的现状、是否强制签名、可否用 GitHub Releases。
- 签名成本：Apple Developer 年费与公证流程、Windows 代码签名证书（OV/EV/Azure Trusted Signing）价格与 SmartScreen 表现。
- 云端 AI：DeepSeek、Qwen（DashScope）从 `tauri://`/`app://` 或 localhost 来源直连是否被 CORS 拦。
- 包体大小。
