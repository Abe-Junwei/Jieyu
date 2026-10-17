---
title: Electron 外壳骨架的范围
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [002,024,034]
issue: https://github.com/Abe-Junwei/Jieyu/issues/276
---

# Electron 外壳骨架的范围

范围和验收已写入 [ADR-0059](../../../adr/0059-electron-shell-skeleton.md)。本单不实现骨架。骨架只证明一个写操作能经 IPC 写进临时库并读回；按 ADR-0061 读写项目库和 `.jyd`、送系统垃圾箱、认回在 [043](043-desktop-file-ops.md)。

## Question

外壳 = Electron。骨架要包含什么、怎么验收（不实现）：
- 主进程 / 预加载 / 渲染进程划分，上下文隔离与 IPC 白名单。
- 主进程里的 SQLite 存储实现（[ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0046-desktop-sqlite-project-folder.md)），接 [#274](https://github.com/Abe-Junwei/Jieyu/issues/274) 的接口。
- 主进程发 AI 请求、系统钥匙串存密钥；渲染进程 CSP `connect-src` 只放行本地来源（[ADR-0047](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0047-desktop-build-strips-collab-keys-telemetry.md)）。
- 编译期剔除协作 / Supabase 代码（[ADR-0047](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0047-desktop-build-strips-collab-keys-telemetry.md)）。
- ~~`@sentry/electron` 接入渲染与主进程、首启同意弹窗~~（2026-10-14 移到 [#312](https://github.com/Abe-Junwei/Jieyu/issues/312) 诊断与反馈）。
- `userData` 目录布局：偏好、缓存、`backups/<项目>/`。
- Electron e2e 冒烟与 CI 跑法（事实见 [#284](https://github.com/Abe-Junwei/Jieyu/issues/284)）。
- electron-builder 打包配置、开发时怎么跑。

已定，骨架要覆盖：
- 项目位置：首次启动由用户选；选在同步文件夹（百度网盘、iCloud、OneDrive 等）里时给出警告。
- 单写者：项目文件夹放锁文件，第二个窗口打开同一项目时提示「已在别处打开」。

