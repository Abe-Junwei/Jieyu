---
title: ADR 0079 - 桌面壳经开关接上 SQLite 存储接口
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-22
source_of_truth: decision-record
depends_on:
  - ./0048-storage-port.md
  - ./0061-jyd-manuscript-file-audio-stays-plain.md
  - ./0063-desktop-only-after-electron-skeleton.md
---

# ADR 0079：桌面壳经开关接上 SQLite 存储接口

## 状态

accepted。#275 的存储接口继续写 SQLite。本篇不改已接受 ADR 的正文。

## 背景

SQLite 实现已经能写回合、审计和一批项目文件夹操作，但还没有装进桌面壳。浏览器测试和现有骨架仍走 Dexie。ADR-0048 要求一次业务操作一次事务，事务不能跨多次 IPC。

## 决策

1. 开关默认关。没打开时，桌面和浏览器都继续用 Dexie。浏览器构建不安装这个实现。
2. 开关打开时，渲染进程用 `installStoragePort` 换上 IPC 代理。每个存储方法一次 IPC，嵌套方法也是一次。主进程在已经锁定的项目文件夹上，同时打开调用方传入的 userData 库和该文件夹里的 `project.sqlite`。
3. userData 文件不在项目文件夹里。`project.sqlite` 必须已经带着项目库的 `application_id`，否则拒绝打开。冒烟自己准备这两份文件，只写入一条回合，不写项目行。
4. 冒烟把开关打开，从渲染进程写入这条回合，主进程关掉再打开，读回的是同一条。

## 影响

- 其余还没实现的存储方法仍由 SQLite 实现拒绝。这一篇不迁那些调用。
- 文件选择器、系统垃圾箱和既有直连调用不在这一篇。

## 被放弃的备选方案

1. 默认打开。浏览器测试和现有桌面骨架还走 Dexie。
2. 只打开 userData。项目库文件不在，就还没接上这份已锁定的文件夹。
3. 把 userData 放进项目文件夹。那份库由调用方传入，不属于这一份文稿。
4. 一次方法拆成多次 IPC。事务不能跨 IPC。
