---
title: 桌面文件操作：项目库与 .jyd 读写、送系统垃圾箱、认回
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [025,026]
issue: https://github.com/Abe-Junwei/Jieyu/issues/325
---

# 桌面文件操作：项目库与 .jyd 读写、送系统垃圾箱、认回

## Question

桌面版把项目文件夹里的文件当真源（[ADR-0061](../../../adr/0061-jyd-manuscript-file-audio-stays-plain.md)）。`src/db/projectFiles/fileOps.ts` 已有导入、配对、拆开、改名、隐藏、删除，以及按操作 id 续做，只在合成材料上测过。还没接主进程、存储端口和系统垃圾箱。

要做：

- 主进程用 better-sqlite3 打开项目库和 `.jyd`（[ADR-0059](../../../adr/0059-electron-shell-skeleton.md) 第 2 条）。一次业务操作一次 IPC、一个事务，写完读回（[ADR-0048](../../../adr/0048-storage-port.md)）。
- 删除就是送进系统垃圾箱，不做应用内回收站。隐藏是移进项目里的 `已隐藏/`；隐藏的文件参加同名判断（[ADR-0062](../../../adr/0062-desktop-storage-decisions-2026-10-16.md) 第 2 条）。
- 认回：用户从垃圾箱还原后，按 `.jyd` 里的 id 和录音 sha256 认回。同一哈希有两个以上候选，或文稿 id 已经在场，停下问用户，不自动选。
- 选文件夹的弹窗和看板变化的订阅走单独的通道，不进存储端口（ADR-0062 第 7 条）。
- 操作中途退出，下次打开按操作 id 续完或退回。
- 配对录音和文稿时守住一份文稿一条录音：已经配了录音的文稿再配一条，就是替换，先提示（2026-10-17 从 #327 并入）。

验收：Electron 主进程测试；关掉再打开后逐 id 读回；送垃圾箱后文件不在文件夹里；还原后能认回；同哈希两个候选时出现选择；一条 Electron 冒烟（跑法见 [#284](https://github.com/Abe-Junwei/Jieyu/issues/284)）。
