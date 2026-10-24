---
title: ADR 0081 - 产物的创建时间在项目库
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-24
source_of_truth: decision-record
depends_on:
  - ./0048-storage-port.md
  - ./0061-jyd-manuscript-file-audio-stays-plain.md
  - ./0071-speaker-assignment-columns.md
  - ./0080-conversations-stay-in-project-library.md
---

# ADR 0081：产物的创建时间在项目库

## 状态

accepted。#275 的存储接口继续写 SQLite。本篇不改已接受 ADR 的正文。

## 背景

迁移脚本已经把产物建在项目库里。活的产物行要记下创建时间。审计写在 userData，和产物不在同一个库文件里。

## 决策

1. 产物留在项目库 `agent_artifacts`。不进 `.jyd`，不进 userData。
2. 列维持迁移已有的那些，另加可空的 `created_at`。迁移的写入和读出不碰这列，所以旧的迁移对象不变。打开已有的项目库时不加列。
3. 读一条时，创建时间是空的，就不读。其它列照库里的值返回。空白 id 没有这条。
4. 写入先在项目库提交产物行，再在 userData 提交审计行。审计失败时产物留下。提交后读回 `uri`、创建时间和审计的 `documentId`。读回失败不撤销。
5. 不从审计行反推创建时间，不把创建时间写进 `body_json`，不加 `updated_at`。

## 影响

- 存储接口的 SQLite 实现按这个规则读和写。浏览器里的 Dexie 仍是一次事务，审计失败时产物也不留下。
- 调用方 `persistAgentArtifact` 不改。
- 其余还没实现的存储方法仍拒绝。

## 被放弃的备选方案

1. 从 userData 的审计行还原创建时间。一条产物能对上多次写入，没有审计的迁移行对不上。
2. 把创建时间塞进 `body_json`。那会改产物正文。
3. 从文档类型里删掉 `createdAt`。活的文档仍要求这个字段。
4. 打开旧库时 `ALTER TABLE`。会话列没有这样做。没有这列的旧文件，查询直接失败。
