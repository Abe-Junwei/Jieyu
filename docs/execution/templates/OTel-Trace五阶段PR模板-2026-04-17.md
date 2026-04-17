# OTel + Trace透传 + conflict_resolved 五阶段 PR 模板

> 用法：按阶段复制对应模板，保持每个 PR 只覆盖当前阶段目标，避免跨阶段混改。

## 通用标题规范

1. `feat(observability): ...`
2. `feat(ai-trace): ...`
3. `feat(collaboration): ...`
4. `chore(ci): ...`
5. `docs(release): ...`

## 通用必填项

### 变更摘要

1. 本 PR 完成的阶段与目标
2. 非目标范围（明确未做内容）

### 落位说明

1. 主要改动文件
2. 为什么落在该层（orchestrator/provider/service）

### 风险与回滚

1. 主要风险
2. 回滚开关与步骤

### 验证结果

1. 自动验证命令与结果
2. 手工验证步骤与结果

---

## 阶段一 PR 模板

### 阶段目标

1. 固化 OTel/Sentry 并存策略
2. 明确浏览器 OTLP CORS、鉴权、采样与降级

### 变更清单

- [ ] 文档补充（执行方案/README）
- [ ] OTel 启动失败降级行为核对
- [ ] Sentry 与 OTel 开关关系核对

### 验收

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run test:otel-smoke`

### 通过标准

1. collector 不可达不阻断应用启动
2. 观测策略在文档中可执行

---

## 阶段二 PR 模板

### 阶段目标

1. ChatOrchestrator 统一 trace 透传
2. provider 层可选注入 trace header

### 变更清单

- [ ] 扩展 `ChatRequestOptions` 透传字段
- [ ] ChatOrchestrator 下发透传上下文
- [ ] provider 请求层按开关注入 header
- [ ] 补充 provider 与 orchestrator 测试

### 验收

- [ ] `npx vitest run src/ai/ChatOrchestrator.test.ts`
- [ ] `npx vitest run src/ai/providers/OpenAICompatibleProvider.test.ts src/ai/providers/AnthropicProvider.test.ts src/ai/providers/GeminiProvider.test.ts src/ai/providers/CustomHttpProvider.test.ts`
- [ ] `npm run typecheck`

### 通过标准

1. 关闭开关后 header 注入完全停用
2. 不影响原有流式返回与 fallback 行为

---

## 阶段三 PR 模板

### 阶段目标

1. tool-execution 与 agent-loop-step 在生产链路真实产出

### 变更清单

- [ ] local tools 执行路径加 span
- [ ] agent loop step 路径加 span
- [ ] 成功/失败路径都调用 end 或 endWithError
- [ ] 相关测试补齐

### 验收

- [ ] `npx vitest run src/ai/chat/localContextTools.test.ts src/ai/chat/localToolSlotResolver.test.ts src/ai/chat/agentLoop.test.ts src/ai/chat/aiArchitectureIntegration.test.ts`
- [ ] `npm run typecheck`
- [ ] `npm run build`

### 通过标准

1. llm-request、tool-execution、agent-loop-step 三类指标均可观测
2. 不新增并行 aiTrace 实现

---

## 阶段四 PR 模板

### 阶段目标

1. 冲突应用主路径补写 conflict_resolved
2. operationLogs 持久化责任收口

### 变更清单

- [ ] 在非 manual-review 且已应用 nextState 路径追加 `conflict_resolved`
- [ ] payload 包含 strategy 与 conflict code 摘要
- [ ] 上游持久化路径明确并实现
- [ ] 协作测试补齐

### 验收

- [ ] `npx vitest run src/collaboration/collaborationBetaRuntime.test.ts src/collaboration/collaborationConflictRuntime.test.ts src/collaboration/collaborationRulesRuntime.test.ts`
- [ ] `npm run typecheck`

### 通过标准

1. 从冲突检测到最终应用全链路有可追溯日志
2. 不影响 manual-review 阻断语义

---

## 阶段五 PR 模板

### 阶段目标

1. CI 接入观测合同校验
2. 灰度与回滚 runbook 可执行

### 变更清单

- [ ] 新增或对齐 `test:otel-contract`/`test:otel-smoke`
- [ ] CI 增加观测合同步骤
- [ ] 发布门禁文档补灰度阈值与回滚条件

### 验收

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] `npm run test:otel-smoke`

### 通过标准

1. CI 能稳定执行观测合同测试
2. 灰度失败具备明确自动或手动回滚路径
