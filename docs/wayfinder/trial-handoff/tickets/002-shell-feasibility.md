---
title: 调研：Electron 跑现有 Vite 应用的事实清单
label: wayfinder:research
mode: AFK
status: closed (completed)
assignee:
blocked_by: []
issue: https://github.com/Abe-Junwei/Jieyu/issues/252
---

# 调研：Electron 跑现有 Vite 应用的事实清单

## Question

外壳已定 Electron（Tauri 对比不再需要）。收集 2026 年事实，不做决定：
- Windows 中文输入法在 Electron 下的已知问题。
- electron-updater + GitHub Releases：Mac 必须签名公证；Windows 不签名时能否自动更新、SmartScreen 表现。
- Apple Developer 年费与公证流程在 CI 中的做法。
- 系统钥匙串：keytar 已停维，2026 可用替代（safeStorage 等）。
- 主进程发 AI 请求：流式响应经 IPC 回传的常见做法。
- 包体大小、最低 macOS/Windows 版本（供 [#270](https://github.com/Abe-Junwei/Jieyu/issues/270)）。
- 主进程读写大音频文件与渲染进程播放（wavesurfer）的路径方式。

补充：核实当前 Electron 版本实际支持的最低 macOS 版本（用户定的是 macOS 11+，见 #270）。


## Resolution

2026-10-14 调研拍板：最低 macOS 13 + Electron 44；SQLite 驱动 better-sqlite3（主进程，经 IPC）；Windows 不签名，自动更新靠 HTTPS + sha512；API 密钥用 safeStorage。报告见 [research/RESEARCH_252_284.md](../research/RESEARCH_252_284.md)。
