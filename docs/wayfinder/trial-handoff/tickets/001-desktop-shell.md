---
title: 桌面外壳选型：Tauri 还是 Electron
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [002]
---

# 桌面外壳选型：Tauri 还是 Electron

## Question

仓库里没有任何桌面外壳（无 src-tauri/、无 electron，vite.config 只有 web 构建，部署走 vercel.json）。要做 Mac 和 Windows 安装包，用哪种外壳？需权衡：包体大小、IndexedDB/OPFS 数据目录在外壳中的位置与持久性、WebGPU/音频解码（wavesurfer）兼容、CSP（ADR-0021 严格 CSP）、Sentry、文件读写（导入导出 JYM/JYT/EAF）、团队维护成本。依赖 002 的事实。
