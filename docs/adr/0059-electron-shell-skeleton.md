---
title: ADR 0059 - Electron 骨架的范围和验收
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: decision-record
---

# ADR 0059：Electron 骨架的范围和验收

## 状态

accepted。用户 2026-10-13 至 2026-10-14 已定外壳和打包条款。本篇只划定骨架包含什么、怎样算通过。不在本篇里写主进程代码。表结构仍是 #275，模块迁移仍是 #280。

## 背景

试用版是 Electron 桌面应用。存储接口（ADR-0048）、两层数据（ADR-0058）和模型调用从主进程出去（ADR-0047、ADR-0057）都已定。仓库里还没有 Electron 工程。#276 要先定骨架边界，避免第一版把 SQLite 全表、297 个模块迁移和崩溃上报一起做进来。

## 决策

1. 进程只有三块。主进程持有 SQLite、文件、钥匙串和出站 HTTP。预加载脚本打开上下文隔离，关闭 node 集成，只暴露具名 IPC 方法。渲染进程是现有 Vite 页面，不读密钥，不打开数据库。
2. SQLite 用 better-sqlite3，放在主进程。一次业务操作是一次 IPC，里面一次 BEGIN/COMMIT，遵守 ADR-0048。渲染进程不跨多次 IPC 持有事务。随 Electron 升级时，打包流程重编这个原生模块，并从 asar 里解包。完整表结构是 #275；骨架只证明存储接口上的一个写操作能经 IPC 写进临时 `project.sqlite` 并读回。
3. 媒体不经 IPC 传整段字节。主进程用自定义协议把 `media/` 里的文件流给渲染进程，并支持 Range。波形和播放器用这个地址。
4. 出站 HTTP 只从主进程发出，包括云端 AI 和本机回环模型。流式响应用一个 requestId 分块推回，渲染进程可以按这个 id 中止。密钥用 `safeStorage` 加密后放在 userData，不进项目文件夹，不进偏好备份。
5. 桌面构建在编译期不打进协作和 Supabase。渲染进程 CSP 的 `connect-src` 只放行本地来源。
6. `userData` 至少有这四块：偏好、缓存、`backups/<项目>/`、`models/`。归层遵守 ADR-0058。Whisper 权重不进安装包，下载校验后放 `models/`。
7. 首次启动由用户选项目文件夹。路径落在 iCloud、OneDrive 或百度网盘目录时给出警告，仍允许继续。项目文件夹里放锁文件。另一个窗口打开同一文件夹时提示「已在别处打开」。持有锁的进程已经不在时，下一次打开可以接手，避免崩溃后项目打不开。
8. 打包用 electron-builder：Apple 芯片 Mac 出 dmg/zip，Windows x64 出 NSIS。最低系统是 macOS 13、Windows 10，Electron 44。Windows 更新关闭签名校验，用 HTTPS 和 electron-updater 的 sha512。签名、公证和 SmartScreen 说明归发布流水线，不在骨架里做完。
9. 浏览器端到端测试仍是主回归。另加 5 到 8 条 Electron 冒烟，每个 PR 在 Linux、macOS、Windows 上跑。冒烟至少覆盖：启动、选择项目文件夹、同步目录警告、第二窗口被锁挡住、一次存储读回、主进程发出的请求渲染进程看不到密钥、媒体地址能取到 Range。Windows 中文输入法抢键放进手测清单，不挡这 5 到 8 条。
10. 崩溃上报、反馈邮件和诊断包是 #312，不进骨架。

## 影响

- 骨架落地时新增 Electron 主进程、预加载和一条冒烟命令。浏览器构建和 Dexie 实现保持能测。
- #275 在这套进程划分上建表。#280 按 ADR-0058 把直连模块改到存储接口，经同一条 IPC。
- 输入法、媒体 Range 和 AI 分块这三件，以骨架冒烟的结果为准，不沿用调研里的未实测句子。

## 被放弃的备选方案

1. 用 `node:sqlite`。2026-10-14 已定 better-sqlite3。
2. 渲染进程经 IPC 传输整段音频。
3. 第一版同时迁完约 297 个直连模块。
4. 把 Sentry 放进骨架。已改到 #312。
5. 每个 PR 只在 Linux 上跑 Electron 冒烟。已定三平台都跑。
