---
title: ADR 0066 - 会话记忆载荷是项目库里的一段 JSON
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-21
source_of_truth: decision-record
depends_on:
  - ./0048-storage-port.md
  - ./0060-card-file-ownership-and-operations.md
  - ./0061-jyd-manuscript-file-audio-stays-plain.md
---

# ADR 0066：会话记忆载荷是项目库里的一段 JSON

## 状态

accepted。#275 按「定一块、写一块」写下的第一块列形状。本篇不改已接受 ADR 的正文。

## 背景

会话记忆在数据层是不透明对象：形状归 AI 层，读取先规范化，写入另有校验。Dexie 行是 `id`、`conversationId`、`payload`、`updatedAt`，`id` 与 `conversationId` 相同。合成迁移原先不写这张行。

SQLite 里可以把它拆成多列，也可以整段存 JSON。载荷的键会随 AI 层变。拆列会把那些键冻进尚未冻结的项目库格式。

## 决策

1. 会话记忆在项目库，表 `ai_session_memories`。不进 `.jyd`，不进定义副本。
2. 一行一个会话。`id` 等于 `conversation_id`。`updated_at` 是非空文本。
3. `payload_json` 是 JSON 对象文本。项目库不拆键、不解释键。读回时解析成对象。数组、`null` 和其他非对象不写，记入丢弃。空对象要写。
4. 所属会话不在留下的会话里、或 `id` 与会话 id 不同的行，不写。

## 影响

- 存储接口的 SQLite 实现沿用这张表，不另起列。
- `model_runs` 的字段仍以 [ADR-0057](./0057-model-interface-transcribe.md) 第 8 条为准，不在本篇重定。

## 被放弃的备选方案

1. 按 AI 层当前的键拆列。键一变就要改格式。
2. 继续不存载荷，只留会话行。现有行的真值就是载荷。
3. 放进 `.jyd` 或定义副本。会话不属于一份文稿。
