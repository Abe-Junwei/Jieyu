# ARCH-8：浏览器 Worker 轻量登记与可观测性

## 目标

在不做「全站 Worker 池 + 通用心跳 / 自动重启」的前提下，为调试与遥测提供**统一登记**入口，与各处已有的 `onerror` / `terminate` / 业务内重试（如 `EmbeddingRuntime`）**并存**。

## 实现

- `src/observability/managedWorkerRegistry.ts`：内存表、`getManagedWorkerRegistrySnapshot()`、测试用 `resetManagedWorkerRegistryForTests()`。
- `src/observability/trackBrowserWorkerLifecycle.ts`：对真实 `Worker` 挂接 `error` / `messageerror`，返回 `release()`；在 `worker.terminate()` 前后调用一次以移除监听并标记 `terminated`。
- 已接入：`useDeferredAiRuntimeBridge`、`WorkerEmbeddingRuntime`、`WhisperXVadService`、`AcousticAnalysisService`、`serializeAcousticExportWithWorker` 等（见代码内 `source` 字段）。

## 不在本项范围内的内容

- 浏览器侧无可靠「Worker 内心跳 + 主线程驱动重启」的通用方案，故**不**以本登记层替代各模块的健康策略。
- 不强制所有 `new Worker` 路径都登记；新增路径建议与现有模式一致，便于问题排查。

## 相关

- 整改表：`docs/remediation-plan-2026-04-24.md` §3.8
