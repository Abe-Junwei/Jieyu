---
title: ARCH-1 fireAndForget 治理决策摘要
doc_type: execution-governance-arch-decision
status: active
owner: repo
last_reviewed: 2026-04-30
source_of_truth: arch1-fire-and-forget
---

# ARCH-1：`fireAndForget` 治理决策摘要

异步路径失败**不得**静默吞没；同时**不**强制全库迁移到 `Result` / `neverthrow`。收口以 **`fireAndForget` 分档策略 + CI 守卫** 为主。

## 实现与守卫

- 实现：[src/utils/fireAndForget.ts](../../../src/utils/fireAndForget.ts) — `context`、`policy: 'user-visible' | 'background' | 'background-quiet'`、按档默认 Sentry、可选 `onError` / `reportToSentry`；`user-visible` 失败经 `FIRE_AND_FORGET_ERROR_EVENT` 透出为 Toast。
- CI：`npm run check:fire-and-forget-governance`
- 单测：`src/utils/fireAndForget.test.ts`；边界显式分支可配合 `asyncResultFromPromise` + `AsyncResult`。

## 与整改清单的对账

- 完整状态与「刻意不做」范围见 [docs/remediation-plan-2026-04-24.md](../../remediation-plan-2026-04-24.md) **§3.1**（ARCH-1）。
