---
title: 桌面外壳选型：Tauri 还是 Electron
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [002]
issue: https://github.com/Abe-Junwei/Jieyu/issues/251
---

# 桌面外壳选型：Tauri 还是 Electron

## Question

用户 2026-10-13 19:11 定为桌面外壳交付（取代本地启动器+浏览器方案）。仓库里还没有外壳（无 src-tauri/、无 electron）。按 [#252](https://github.com/Abe-Junwei/Jieyu/issues/252) 的事实，选 Tauri 2 还是 Electron。权衡：包体、数据目录与持久性、Windows 中文输入法、音频解码（wavesurfer）、严格 CSP（ADR-0021）、Sentry、文件读写（JYM/JYT/EAF）、自动更新与签名成本、维护成本。

注意：[主路线图](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/execution/plans/%E8%A7%A3%E8%AF%AD-%E4%B8%BB%E8%B7%AF%E7%BA%BF%E5%9B%BE-master-roadmap-2026-06-01.md) §1 North Star 写的是「纯 Web、非 WebView」，本单拍板后需同步改那里。
