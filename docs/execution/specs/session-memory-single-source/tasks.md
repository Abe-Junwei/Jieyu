---
title: session-memory-single-source tasks
doc_type: execution-spec-tasks
status: active
owner: repo
last_reviewed: 2026-06-01
source_of_truth: session-memory-single-source-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — session-memory-single-source

- [x] 删除 localStorage 读写与 G2e 迁移
- [x] 实现 `sessionMemoryStore.ts`（Dexie + LRU 32）
- [x] 拆分 normalize / mutation 模块
- [x] 重写 `sessionMemory.test.ts`（bind 契约）
- [x] architecture-guard 通过
