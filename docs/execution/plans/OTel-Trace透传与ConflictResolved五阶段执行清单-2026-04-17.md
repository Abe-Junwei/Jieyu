---
title: OTel + Trace透传 + conflict_resolved 五阶段执行清单
doc_type: execution-plan
status: draft
owner: repo
last_reviewed: 2026-04-17
source_of_truth: execution-plan
---

# OTel + Trace透传 + conflict_resolved 五阶段执行清单

> 目标：在不重复造轮子的前提下，基于现有 `src/observability/aiTrace.ts` 与 `src/ai/ChatOrchestrator.ts` 完成可发布的全链路观测与协作冲突日志收口。

## 0. 前置约束

1. 不新建平行 aiTrace 实现，统一扩展既有 `src/observability/aiTrace.ts`。
2. 浏览器 OTLP 必须明确 CORS、鉴权模型、采样率与失败降级行为。
3. `conflict_resolved` 语义固定为：检测到冲突且非 manual-review 且最终应用了 nextState。
4. 明确 operationLogs 的持久化责任方，避免“仅返回不落盘”。5. OTel span 路径必须包含 PII / 密钥过滤（当前 Sentry 有 `beforeSend` 清理，OTel 路径为零防护）。
6. span attribute 基数必须受控（枚举或 hash bucket），避免高基数拖垮后端。
## 1. 阶段一：观测基建与并存策略

### 1.1 目标

1. 固化 OTel 与 Sentry 并存策略。
2. 明确 prod/dev/staging 三环境的开关与采样。
3. 保证 collector 不可达时不阻断主链路。

### 1.2 主要改动

1. 文档：README 与 execution 方案文档补充 OTel 运行约束。
2. 可选代码收口：`src/observability/otel.ts`、`src/observability/sentry.ts` 日志与开关一致性。

### 1.3 建议提交

1. `docs(observability): 明确 OTel/Sentry 并存策略与浏览器 OTLP 约束`
2. `chore(observability): 收口 OTel/Sentry 启动开关与失败降级行为`

### 1.4 验收命令

1. `npm run typecheck`
2. `npm run build`
3. `npm run test:otel-smoke`

### 1.5 回滚点

1. 关闭 `VITE_ENABLE_OTEL`，保留 Sentry 路径。

### 1.6 浏览器导出器行为规格

1. **Exporter**：OTLP HTTP/protobuf（或 JSON）+ 同源代理路径（如 `/ingest/v1/traces`）作为首选，避免浏览器直连公网 collector 的 CORS/鉴权问题。
2. **Processor**：`BatchSpanProcessor`（已使用）；队列满时丢弃并 `recordMetric`（与现有 metrics 打通），禁止同步阻塞 UI。
3. **重试**：指数退避 + 最大重试次数；collector 连续失败 N 次后熔断至仅内存/仅 Sentry。
4. **Resource**：`service.name`（已有）、`service.version`（对接 `__APP_VERSION__`）、`deployment.environment`（已有）。
5. **Sampler**：父子采样一致；prod 默认 `parentbased = 0.01–0.05`；强制 debug 会话通过 session flag 例外。

> 当前缺口：`OTLPTraceExporter` 仅传 `{ url }` 无重试/超时/队列配置（otel.ts#L117）。

### 1.7 PII 与密钥红线

1. OTel span attribute **禁止**携带 raw prompt、工具参数全文、API key。
2. 在 `BatchSpanProcessor` 前增加一个 **attribute-scrub span processor**，对匹配 `/api.?key|token|password|secret|authorization/i` 的 attribute value 做 `[REDACTED]`。
3. prompt 相关字段仅记录长度或 hash，不记录原文。

> 当前缺口：Sentry 有 `beforeSend` PII 清理（sentry.ts#L58），logger 有 `scrubData`（logger.ts#L81），OTel 路径为零防护。

### 1.8 OTel 与 Sentry 职责分配表

| 信号 | 采集方 | 说明 |
|------|--------|------|
| navigation / page load | Sentry `browserTracingIntegration` | OTel 当前无自动 instrumentation，不冲突 |
| fetch / XHR | Sentry（已有） | OTel 暂不注册 `FetchInstrumentation`；若未来启用须关闭 Sentry 对应采集 |
| LLM / tool / agent span | OTel（via `aiTrace`） | Sentry 不采集 |
| error capture | Sentry | OTel 仅在 span 上 `recordException` |

> 约定：未来若 OTel 增加 fetch/navigation 自动 instrumentation，须同步关闭 Sentry 对应 integration，避免双采。此约束写入门禁检查项。

## 2. 阶段二：LLM 出口统一 trace 透传

### 2.1 目标

1. 由 ChatOrchestrator 统一生成并传递 trace 上下文。
2. 在 provider 请求层可选注入 trace header。
3. 支持单点开关关闭 header 注入。

### 2.2 主要改动

1. `src/ai/ChatOrchestrator.ts`
2. `src/ai/providers/LLMProvider.ts`
3. `src/ai/providers/*Provider.ts`
4. 相关 provider 测试文件

### 2.3 建议提交

1. `feat(ai-trace): 在 ChatOrchestrator 扩展 trace 透传协议`
2. `feat(ai-trace): provider 层注入 trace header 并增加开关`

### 2.4 验收命令

1. `npx vitest run src/ai/ChatOrchestrator.test.ts`
2. `npx vitest run src/ai/providers/OpenAICompatibleProvider.test.ts src/ai/providers/AnthropicProvider.test.ts src/ai/providers/GeminiProvider.test.ts src/ai/providers/CustomHttpProvider.test.ts`
3. `npm run typecheck`

### 2.5 回滚点

1. 关闭 trace header 注入开关，仅保留本地 span。

### 2.6 语义约定对齐

1. 对外 HTTP 子 span 使用 `http.client` 域属性。
2. LLM 编排 span 使用 `gen_ai.*` 语义属性（若 SDK 版本支持；否则用过渡名并在文档标注迁移计划）。
3. 属性字典见附录 A。

> 当前缺口：仓库内 `gen_ai` / `ATTR_GEN_AI` 零匹配，所有 span 属性为自定义命名。

### 2.7 Header 注入分层开关

| 环境变量 | 职责 | 默认值 |
|----------|------|--------|
| `VITE_OTEL_EXPORT_ENABLED` | 控制整体 OTel 导出 | `false` |
| `VITE_OTEL_INJECT_TRACE_CONTEXT_HEADERS` | 独立控制 `traceparent` 注入（满足合规/第三方顾虑） | `false` |

1. Header 格式：优先 `traceparent`（W3C Trace Context）。
2. `tracestate` 仅在有厂商约定时使用，限长 512 bytes。
3. `baggage` 默认不启用；若启用须白名单 key + 总长度上限。

> 当前缺口：所有 provider fetch headers 仅含 auth 字段，无 trace context 注入（grep 零匹配）。

## 3. 阶段三：tool 与 agent 生产埋点补全

### 3.1 目标

1. 让 `tool-execution`、`agent-loop-step` 在生产链路真正产出。
2. 保证每类 span 在成功/失败路径都闭环结束。

### 3.2 主要改动

1. `src/ai/chat/localContextTools.ts`
2. `src/ai/chat/localToolSlotResolver.ts`
3. `src/ai/chat/agentLoop.ts`
4. 必要时扩展 `src/observability/aiTrace.ts`（不新增平行文件）
5. 对应测试：
   - `src/ai/chat/localContextTools.test.ts`
   - `src/ai/chat/localToolSlotResolver.test.ts`
   - `src/ai/chat/agentLoop.test.ts`
   - `src/ai/chat/aiArchitectureIntegration.test.ts`

### 3.3 建议提交

1. `feat(ai-trace): 为 local tools 补齐 tool-execution span`
2. `feat(ai-trace): 为 agent loop 补齐 step span 与错误闭环`

### 3.4 验收命令

1. `npx vitest run src/ai/chat/localContextTools.test.ts src/ai/chat/localToolSlotResolver.test.ts src/ai/chat/agentLoop.test.ts src/ai/chat/aiArchitectureIntegration.test.ts`
2. `npm run typecheck`
3. `npm run build`

### 3.5 回滚点

1. 增加埋点总开关，必要时降级到 llm-request 单层埋点。

### 3.6 Span 与现有 metrics 的关系

1. **Metrics 做 SLO/告警，Traces 做下钻**。
2. 每个 `tool-execution` / `agent-loop-step` span 的 attribute **基数约束**：`tool_name` 使用枚举或 hash bucket（上限 50），避免高基数。
3. 错误记录：`span.recordException` + `otel.status_code=ERROR`，与现有 `ai.trace.*_error_count` 保持同一语义，避免双计数口径。

## 4. 阶段四：conflict_resolved 主路径补洞与持久化

### 4.1 目标

1. 在 `applyMultiLayerBatchEdits` 的非 manual-review 冲突应用路径补写 `conflict_resolved`。
2. 明确 operationLogs 由谁持久化到审计存储。

### 4.2 主要改动

1. `src/collaboration/collaborationBetaRuntime.ts`
2. `src/collaboration/collaborationConflictRuntime.ts`
3. 调用批处理的上游服务或 runtime（负责落盘）
4. 测试：
   - `src/collaboration/collaborationBetaRuntime.test.ts`
   - `src/collaboration/collaborationConflictRuntime.test.ts`
   - `src/collaboration/collaborationRulesRuntime.test.ts`

### 4.3 建议提交

1. `feat(collaboration): 非 manual-review 冲突应用路径追加 conflict_resolved`
2. `feat(collaboration): operationLogs 持久化边界收口`

### 4.4 验收命令

1. `npx vitest run src/collaboration/collaborationBetaRuntime.test.ts src/collaboration/collaborationConflictRuntime.test.ts src/collaboration/collaborationRulesRuntime.test.ts`
2. `npm run typecheck`

### 4.5 回滚点

1. 临时关闭 `conflict_resolved` 写入，仅保留 arbitration 日志。

### 4.6 审计字段补全

`conflict_resolved` 日志应包含以下字段（对齐可重放审计需求）：

| 字段 | 说明 |
|------|------|
| `decision_id` | 与前序 `arbitration_*` 日志的 `logId` 可 join |
| `strategy` | 如 `last-write-wins` |
| `conflict_codes[]` | 冲突摘要数组 |
| `trace_id`（可选） | 当前 OTel root/活跃 span 的 traceId（需隐私评审通过） |

> 当前缺口：`CollaborationOperationLog` 仅含 `logId/type/entityId/sessionId/at/payloadDigest`，无 `trace_id` 或 `correlation_id`。

### 4.7 单一持久化 writer

1. 明确只由一个模块（如 `CollaborationSyncService` 或上游调用方）在事务边界内 append audit log。
2. 禁止 `collaborationBetaRuntime` 和调用方各写一半。
3. 验收：在测试中断言同一冲突事件仅产生一条 `conflict_resolved` 日志。

## 5. 阶段五：CI 门禁、灰度与回滚手册

### 5.1 目标

1. 建立观测合同脚本并接入 CI。
2. 明确灰度门槛与自动回滚触发条件。

### 5.2 主要改动

1. `package.json` 新增/统一脚本（如 `test:otel-contract` 指向 `test:otel-smoke`）。
2. `.github/workflows/ci.yml` 新增观测合同步骤。
3. `docs/execution/release-gates/` 新增灰度与回滚 runbook。

### 5.3 建议提交

1. `chore(ci): 增加 OTel 合同测试门禁`
2. `docs(release): 增加观测灰度与回滚 runbook`

### 5.4 验收命令

1. `npm run typecheck`
2. `npm run build`
3. `npm run test:e2e`
4. `npm run test:otel-smoke`

### 5.5 回滚点

1. 先关 header 注入。
2. 再关 OTel 上报。
3. 最后回滚新增埋点代码。

### 5.6 CI smoke 断言定义

`test:otel-contract` 必须包含以下断言（不仅是 `hits > 0`）：

1. 初始化成功 + exporter mock 接收到至少 1 个 span。
2. span 携带 `service.name`、`deployment.environment` resource 属性。
3. 自定义 span attribute 符合属性字典（附录 A）。
4. 错误路径 span 以 `ERROR` 状态结束。

> 当前缺口：`otel.collectorSmoke.test.ts` 仅断言 `collector.hits > 0`。

### 5.7 门禁与人工 checklist 分层

| 类型 | 内容 | 执行方式 |
|------|------|----------|
| CI 门禁 | `test:otel-contract` + `typecheck` + `build` | 自动，PR 必过 |
| 产品回归 | `test:e2e` | 自动，验证产品功能不退化（不承载 OTLP 到达证明） |
| 发布前 checklist | staging 人造负载 → collector 收包 → Grafana 查看 | 手动，发布经理确认 |

### 5.8 灰度策略

1. 采样率梯度：内部用户 100% → beta 用户 10% → 全量 1-5%。
2. 按租户/项目/内部用户 allowlist（feature flag）。
3. 回滚数据面：若某版本 span attribute 爆炸导致 collector OOM，立即回滚版本号 + 临时提高采样丢弃率。

## 6. 执行节奏建议

1. 串行关键路径：阶段一 -> 阶段二 -> 阶段三。
2. 可并行路径：阶段四可在阶段二后并行推进。
3. 收口顺序：阶段三与阶段四完成后进入阶段五统一放行。

## 7. 发布门槛

1. 无 P0/P1 未决项。
2. 关键链路测试、typecheck、build 全绿。
3. OTel collector 冒烟通过且失败降级路径验证通过。
4. conflict_resolved 在目标路径可观察、可追溯、可持久化。
5. OTel span 路径 PII 过滤验证通过（含 attribute-scrub processor 断言）。
6. span attribute 基数不超过上限（属性字典白名单）。

---

## 附录 A：属性字典与 GenAI 语义映射

> 当前 `aiTrace.ts` 使用自定义属性。下表定义目标属性名及与 OTel GenAI 约定的映射关系。

| 当前属性 | 目标 OTel 属性 | GenAI 约定 | 说明 |
|----------|---------------|------------|------|
| `provider` | `gen_ai.system` | ✓ | 如 `openai` / `anthropic` / `qwen` |
| `model` | `gen_ai.request.model` | ✓ | 模型标识 |
| `usedFallback` | `gen_ai.jieyu.used_fallback` | 自定义 | 布尔，标记是否降级 |
| `fallback_provider` | `gen_ai.jieyu.fallback_system` | 自定义 | 降级目标 provider |
| — | `gen_ai.request.max_tokens` | ✓ | 若可获取 |
| — | `gen_ai.usage.input_tokens` | ✓ | 若可获取 |
| — | `gen_ai.usage.output_tokens` | ✓ | 若可获取 |
| `tool_name` | `gen_ai.jieyu.tool_name` | 自定义 | 枚举或 hash bucket，上限 50 |
| `error` | `otel.status_description` | 标准 | 配合 `otel.status_code=ERROR` |
| — | `http.request.method` | HTTP 约定 | 对外请求 span |
| — | `url.full` | HTTP 约定 | 对外请求 span（脱敏后） |

**迁移策略**：阶段二先以自定义属性发布，在附录中标注目标名；阶段三末统一重命名并更新 smoke 断言。

## 附录 B：PII 过滤规则

| 匹配模式 | 动作 |
|----------|------|
| attribute key 匹配 `/api.?key\|token\|password\|secret\|authorization/i` | value → `[REDACTED]` |
| attribute key 含 `prompt` / `input` / `content` | value → 仅保留长度（`len:1234`） |
| attribute key 含 `url` | 移除 query string 中的 `key=` / `token=` 参数 |
