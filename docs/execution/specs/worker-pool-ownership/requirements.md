---
title: worker-pool-ownership requirements
doc_type: execution-spec-requirements
status: active
owner: repo
last_reviewed: 2026-06-01
source_of_truth: worker-pool-ownership-spec
---

# Requirements — worker-pool-ownership

## 1. What & Why

- **要做什么**：WorkerPool 成为浏览器 Worker 的**唯一创建/注册点**；业务层不再「先 createManagedBrowserWorker 再 register 内二次 factory()」。
- **为什么现在做**：每次 VAD/声学/Embedding init 泄漏 1 个孤儿 Worker + registry 条目永不删除。
- **不做什么**：不改 Worker 业务协议；不合并 unrelated worker 类型。

## 2. 用户场景

1. 开发者 init 声学/VAD/Embedding 后，`getManagedWorkerRegistrySnapshot()` 条目数与活跃 worker 数一致。
2. dispose/terminate 后 registry 不累积 terminated 条目。

## 3. 验收标准

- [ ] `WorkerPool.register` 接受已有 Worker 实例，**不对同一 logical id 二次 factory()**
- [ ] EmbeddingRuntime / WhisperXVadService / AcousticAnalysisService 各仅 1 个物理 Worker per init
- [ ] `markManagedWorkerTerminated` 删除 registry 条目
- [ ] 定向 vitest 覆盖 register-with-existing + registry cleanup

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| Pool | `src/workers/WorkerPool.ts` | register 增 optional existingWorker |
| Registry | `src/observability/managedWorkerRegistry.ts` | terminate 时 delete |
| Service | EmbeddingRuntime, WhisperXVadService, AcousticAnalysisService | 传入已有 worker |
