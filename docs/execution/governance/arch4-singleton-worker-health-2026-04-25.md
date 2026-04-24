# ARCH-4：单例生命周期与 Worker 健康聚合 — 收口说明（已关门）

> doc_type：execution-governance  
> 对账：docs/remediation-plan-2026-04-24.md §3.4、docs/execution/governance/未落地项汇总-2026-04-24.md  
> last_updated：2026-04-25

## 1. 关门边界

- 本次关门范围：DB/Supabase/声学单例生命周期一致性、浏览器 Worker 直建路径收敛、运行态健康聚合快照。
- 验收标准：
1. 关键 Worker 创建路径统一纳入生命周期登记与释放。
2. 提供单例与 Worker 的统一健康快照接口。
3. 对应测试可稳定通过，且全量 typecheck 不回归。

## 2. 代码落地证据

1. Worker 统一创建与追踪
- src/observability/managedBrowserWorkerFactory.ts
- src/pages/useDeferredAiRuntimeBridge.ts
- src/components/ai/aiAnalysisPanelAcousticUtils.ts
- src/services/vad/WhisperXVadService.ts
- src/ai/embeddings/EmbeddingRuntime.ts

2. Worker 运行态管理与心跳
- src/workers/WorkerPool.ts
- src/services/acoustic/acousticAnalysis.worker.ts
- src/workers/vadWorker.ts
- src/ai/embeddings/embedding.worker.ts

3. 单例/运行态健康聚合
- src/observability/runtimeSingletonHealth.ts
- src/observability/runtimeSingletonHealth.test.ts

4. 既有注册表与可观测保留
- src/observability/managedWorkerRegistry.ts
- src/observability/trackBrowserWorkerLifecycle.ts

## 3. 本轮收口修复（2026-04-24）

1. 修复 Worker 心跳消息联合类型不完整导致的 TS2367。
2. 修复 WorkerPool 注册工厂的 WorkerLike/Worker 类型冲突。
3. 修复 useBackupReminder 在 DOM/Node 混合类型下的 setInterval 类型冲突。
4. 修复 ARCH-3 回归测试中随手引入的类型问题，确保全量 typecheck 可通过。

## 4. 回归命令（可直接复跑）

```bash
npx vitest run src/observability/runtimeSingletonHealth.test.ts src/observability/managedWorkerRegistry.test.ts src/utils/fireAndForget.test.ts
npx vitest run src/services/acoustic/AcousticAnalysisService.test.ts -t "ARCH-4"
npm run -s typecheck
```

## 5. 当前结论

- ARCH-4 已按边界收口。
- 代码、测试、类型检查三条证据链均已闭环。
- 后续新增 Worker 路径需继续遵循统一工厂 + 生命周期登记 + 心跳协议的同一口径。