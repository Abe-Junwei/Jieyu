---
title: ADR 0077 - 文稿改挂录音是替换
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-22
source_of_truth: decision-record
depends_on:
  - ./0061-jyd-manuscript-file-audio-stays-plain.md
  - ./0075-recording-row-project-library.md
---

# ADR 0077：文稿改挂录音是替换

## 状态

accepted。#275 的存储接口继续写 SQLite。本篇不改已接受 ADR 的正文。

## 背景

一份文稿同时只关联一条音频（ADR-0061）。再挂一条是替换，不是追加。录音行已经在项目库（ADR-0075）。文稿文件里的关联是 `meta.audio_id`。浏览器库没有 `.jyd`，这条写路径只在 SQLite 上。

## 决策

1. 一次调用只改一份 `.jyd`，一次事务。按 `meta.id` 找到这份文稿。编号去掉空白后是空的，或目录里没有这份文稿，就不写。同一个编号出现在两份 `.jyd` 里，也不写。只扫项目目录，不进子目录。
2. 非空的录音编号必须是项目库里的一行。语段上已有一个项目编号、而录音属于另一个项目，就不写。语段上有两个项目编号，也不写。空编号是摘掉关联。
3. 事务里更新已有的那一行 `meta.audio_id`，不另插一行。这份文稿里每个语段的 `media_id` 改成同一条，并写下 `updated_at`。`source_document_id` 不动。锚点和轨道不动。不删音频文件。
4. 提交后读回：`meta` 仍是一行，`audio_id` 和每个语段的 `media_id` 都是这一条，或都空着。读回失败不撤销。
5. 这一刀不弹确认。替换前要不要问、问什么，还等措辞，不在存储接口里编。

## 影响

- 存储接口的 SQLite 实现按这个顺序写。浏览器里的 Dexie 没有文稿文件，这个方法拒绝，不写。
- 跨文稿的 `unit_relations` 仍是下一刀。

## 被放弃的备选方案

1. 再插一行 `meta`，让一份文稿挂上两条录音。ADR-0061 不允许同时关联多条。
2. 在浏览器库里用语段的 `mediaId` 假装有文稿头。那边没有 `meta.audio_id`。
3. 顺手改锚点和轨道。改挂只对齐文稿头和语段；锚点仍留在原来的录音上。
