---
title: 实现 Electron 外壳骨架
label: wayfinder:task
mode: HITL
status: open
assignee:
blocked_by: [002,024,034]
issue: https://github.com/Abe-Junwei/Jieyu/issues/276
---

# 实现 Electron 外壳骨架

按 [ADR-0059](../../../adr/0059-electron-shell-skeleton.md) 实现骨架并验收。2026-10-17 用户定：本单不再只定范围。

骨架只证明一个写操作能经 IPC 写进临时 `project.sqlite` 并读回。按 ADR-0061 读写项目库和 `.jyd`、送系统垃圾箱、认回在 [043](043-desktop-file-ops.md)。崩溃上报、反馈邮件和诊断包是 [#312](https://github.com/Abe-Junwei/Jieyu/issues/312)，不进本单。

开工前须用户批准把 better-sqlite3 加入 `package.json`（[ADR-0062](../../../adr/0062-desktop-storage-decisions-2026-10-16.md) 第 8 条）。[#275](https://github.com/Abe-Junwei/Jieyu/issues/275) 的 Node vitest 与 Electron 共用这一份。

验收以 ADR-0059 第 9 条为准：启动、选择项目文件夹、同步目录警告、第二窗口被锁挡住、一次存储读回、主进程发出的请求渲染进程看不到密钥、媒体地址能取到 Range。浏览器端到端仍是主回归，直到 [#329](https://github.com/Abe-Junwei/Jieyu/issues/329) 搬走。
