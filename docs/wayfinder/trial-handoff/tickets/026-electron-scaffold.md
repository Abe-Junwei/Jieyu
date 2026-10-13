---
title: Electron 外壳骨架的范围
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [002,024]
issue: https://github.com/Abe-Junwei/Jieyu/issues/276
---

# Electron 外壳骨架的范围

## Question

用户已定外壳 = Electron。骨架要包含什么：主进程/预加载/渲染进程划分、上下文隔离与 IPC 白名单、磁盘存储实现接在哪、主进程发 AI 请求与钥匙串读写的 IPC、electron-builder 打包配置、开发时怎么跑。定范围与验收，不实现。
