# AI 智能体架构改进方案

## 背景

经过两轮代码级审查与核实，当前 AI 子系统呈现"**工程骨架扎实、产品路径未全部跑通**"的状态：

- **已成熟**：send-turn 管道、Agent Loop 恢复、工具决策治理（8 层过滤）、审计追踪、Provider 多模降级、本地上下文工具（20+ 种）。
- **未跑通**：MCP Server 仍为 mock、垂直工作流仅 segment_qa 有完整闭环、release evidence 大量 skipped（缺真实审计数据源）、主 hook 层文件爆炸（useAiChat* 共 65 个文件）。

本方案的目标不是增加新协议或新 workflow，而是**把已有骨架上的关键路径做深做实**，让系统从"工程可信"走向"产品好用"。

---

## 阶段一：MCP Server 真实化（P0，2–3 周）

### 目标
将 `src/ai/mcp/server/tools.ts` 从 static fixtures 迁移到真实 Dexie 查询，使外部 AI 客户端能读取项目上下文。

### 行动项

1. **复用本地上下文工具查询逻辑**
   - 将 `jieyu_list_segments` 映射到 `localContextTools.ts` 中的 `list_units` 或直查 `db.dexie.segment_meta`。
   - 将 `jieyu_get_segment_detail` 映射到 `get_unit_detail`，复用 `SegmentMetaService` / `WorkspaceReadModelService`。
   - 将 `jieyu_diagnose_quality` 映射到 `diagnose_quality` intent tool 或 `WorkspaceReadModelService.summarizeQuality()`。

2. **保持只读契约**
   - Server 层继续拒绝 `resources/create|update|delete`、`tools/create|update|delete` 等写方法。
   - 工具 handler 内部只调用只读 service，不触碰写路径。

3. **增加可观测性**
   - 在 `McpServer.routeMethod` 中为 `tools/call` 增加 audit log（写 `ai_messages` 或 `ai_tasks` 审计表）。
   - 记录调用方 IP、工具名、参数摘要、响应行数。

4. **Feature Flag 控制**
   - 当前 `featureFlags.aiMcpServerEnabled` 硬编码为 `false`。
   - 真实化完成后，改为从环境变量读取（如 `VITE_AI_MCP_SERVER_ENABLED`），默认仍 `false`，staging/dogfood 可手动开启。

### 验收标准
- [ ] MCP Server 启动后，`jieyu_list_segments` 返回当前项目真实语段（非 mock）。
- [ ] `jieyu_get_segment_detail` 返回的 `layers`、`annotations` 与 UI 中该语段状态一致。
- [ ] 新增 `McpServer.test.ts`：mock Dexie 数据，验证 tools/call 返回真实查询结果。
- [ ] `featureFlags.aiMcpServerEnabled` 可通过环境变量控制。

### 涉及文件
- `src/ai/mcp/server/tools.ts`（重写 handler）
- `src/ai/mcp/server/McpServer.ts`（增加 audit）
- `src/ai/config/featureFlags.ts`（flag 控制）
- `src/ai/chat/localContextTools.ts`（作为查询逻辑来源）
- 新增 `src/ai/mcp/server/tools.test.ts`

---

## 阶段二：segment_qa 产品化打样（P1，3–4 周）

### 目标
将 `segment_qa` 从"能跑通"升级为"产品样板"，形成可复制的垂直工作流模板。

### 行动项

1. **Evidence Card 产品化**
   - `EvidencePacketV0` 当前是数据结构，需在 UI 层（`AiChatCard` / `AiChatAlertsPanel`）渲染为可点击的 evidence card。
   - Card 需展示：sourceId、quote 预览、confidence 可视化（低置信标黄/红）。
   - 点击 card 跳转对应语段（调用 `nav_to_segment` 或时间轴滚动）。

2. **低置信提示与无结果 Fallback**
   - `segmentQaReflection.ts` 已检测 `confidence < 0.5`，但当前仅生成 retry prompt，无用户可见提示。
   - 改进：当 reflection flagged 且 `confidence_not_abnormally_low` 失败时，在 UI 中显示警告条（"以下回答引用了低置信度证据，请核实"）。
   - 当 `evidencePackets.length === 0` 时，不进入 degraded 静默，而是主动提示用户"未找到相关语段，建议换个问法或扩大选择范围"。

3. **引用跳转**
   - 助手消息中的 `[n]` citation marker 需渲染为可点击链接。
   - 点击后跳转到对应 evidence packet 的 sourceId 语段。

4. **Reflection Retry 的 UX 闭环**
   - 当前 `buildReflectionRetryPrompt` 仅注入 prompt，用户看不到 reflection 过程。
   - 改进：在 streaming 完成后若 reflection flagged，可在消息下方展开"质量检查"折叠面板，列出通过的/失败的 check。

5. **Eval Suite 运行**
   - `verticalWorkflowRegistry.ts` 中 `segment_qa.evalSuiteId: 'vertical.segment_qa.v0'` 已预留。
   - 需实现对应的 eval cases（放在 `scripts/agent-evals/cases/`），并接入 `suite.v1.json`。
   - 至少覆盖：有 evidence 正常回答、无 evidence fallback、低置信警告、citation marker 越界。

### 验收标准
- [ ] 用户提问后，AI 返回的 evidence card 可点击并跳转对应语段。
- [ ] citation marker `[n]` 可点击跳转。
- [ ] 无 evidence 时显示明确的 fallback UI（非静默 degraded）。
- [ ] 低置信 evidence 触发可见警告条。
- [ ] `scripts/agent-evals/suite.v1.json` 中包含 segment_qa 专属 eval cases，CI 中通过。

### 涉及文件
- `src/ai/vertical/segmentQaReflection.ts`（暴露 reflection 结果给 UI）
- `src/ai/vertical/evidencePacket.ts`（如需扩展字段）
- `src/components/ai/AiChatCard.tsx` 或 `AiChatAlertsPanel.tsx`（evidence card 渲染）
- `src/hooks/useAiChat.ts` / `useAiChat.streamCompletion.ts`（reflection 结果注入消息状态）
- `scripts/agent-evals/cases/segment-qa-*.json`（新增 eval cases）
- `scripts/agent-evals/suite.v1.json`（注册 cases）

---

## 阶段三：主 Hook 结构减压（P2，2–3 周，可与 P1 并行）

### 目标
停止向 `useAiChat` 及其派生文件堆积状态，将纯逻辑下沉到 `src/ai/` 层。

### 行动项

1. **识别可下沉模块**
   - `useAiChat.sendTurn*.ts`（4 个阶段文件）本质是纯异步编排逻辑，可合并下沉为 `src/ai/runtime/sendTurnPipeline.ts`。
   - `useAiChat.agentLoopRunner.ts` 已接近纯逻辑，可迁移到 `src/ai/chat/agentLoopRunner.ts`。
   - `useAiChat.toolDecisionPipeline.ts` 是纯决策逻辑，应下沉到 `src/ai/policy/` 或 `src/ai/chat/`。

2. **主 hook 职责收缩**
   - `useAiChat.ts` 只保留：React 状态声明、refs、对下沉模块的调用委托、UI 回调（`setMessages`、`setIsStreaming` 等）。
   - 所有 `writeToolDecisionAuditLog`、`markExecutedRequestId` 等审计逻辑应封装为 `AiChatRuntime` 类，由 hook 持有实例。

3. **Voice Agent 同步减压**
   - `useVoiceAgent.ts` 当前 443 行（architecture-guard 上限 930），`VoiceAgentService.ts` 1002 行（上限 1100）。
   - 将 STT 引擎切换策略、听写管线等进一步拆分为独立 service 文件，使 `VoiceAgentService.ts` 退化为事件总线 + 状态机壳。

### 验收标准
- [ ] `useAiChat.ts` 行数从 508 行降至 <350 行。
- [ ] 新增 `src/ai/runtime/` 目录，包含 `sendTurnPipeline.ts`、`streamCompletion.ts` 等纯逻辑。
- [ ] `useAiChat.*.ts` 派生文件数量从 64 个减少至 <50 个（通过合并 send-turn 阶段文件）。
- [ ] architecture-guard 对 `useAiChat` 的阈值可从 1350 行下调至 900 行，测试通过。

### 涉及文件
- 新增 `src/ai/runtime/sendTurnPipeline.ts`
- 迁移 `src/hooks/useAiChat.sendTurn*.ts` → `src/ai/runtime/`
- 迁移 `src/hooks/useAiChat.agentLoopRunner.ts` → `src/ai/chat/agentLoopRunner.ts`
- 迁移 `src/hooks/useAiChat.toolDecisionPipeline.ts` → `src/ai/chat/toolDecisionPipeline.ts`
- 修改 `scripts/architecture-guard.config.mjs`（调整阈值）

---

## 阶段四：评估体系与数据闭环（P3，2–3 周，依赖 P1/P2）

### 目标
让 release evidence 从"骨架全绿但 skipped 过半"变成"真实数据驱动"。

### 行动项

1. **填实 skipped 卡片**
   - `c5.background-memory-extraction`：确保 `BackgroundMemoryExtractor` 运行时写入审计数据，release evidence 脚本能读取 `ai_background_memory_extraction` 表。
   - `c7.coordination-lite`：Agent Loop 每步的 coordination notification 已写入 audit log，需让 release evidence 脚本解析这些日志。
   - `c8.user-directive-governance`：`userDirectiveExtractor` 和 `resolveExecutionPolicy` 的运行结果需持久化到 audit，供 evidence 消费。
   - `f3.durable-orchestration`：TaskRunner 的 `ai_tasks` 快照需被 evidence 脚本读取。

2. **规则 Judge 标注 Baseline**
   - 在 `citationJudge.ts` 和 `relevanceJudge.ts` 文件注释及 `docs/architecture/` ADR 中明确标注：**当前为 baseline_judge（规则引擎，<500ms，无 LLM），满足 CI 快门禁；未来可替换为 llm_judge 或 human_judge_provider。**
   - 预留接口：在 `src/ai/eval/` 中新增 `JudgeProvider.ts` 接口，让 `citationJudge.ts` / `relevanceJudge.ts` 实现该接口，为后续替换做准备。

3. **真实使用样本收集**
   - 在 dogfood/staging 环境开启 `aiMemoryRecallShapeTelemetryEnabled` 和 `aiBackgroundMemoryExtractorEnabled`。
   - 每周生成一份 `AiRuntimeReport`，观察 citation/relevance 分数趋势。
   - 若发现趋势异常（如 citation avg < 3），触发 segment_qa prompt 调优。

### 验收标准
- [ ] Release evidence 中 skipped 比例从当前的 ~66%（12/18）降至 <30%。
- [ ] `docs/architecture/` 新增 ADR：`ai-evaluation-judge-provider-contract.md`，明确 baseline/LLM/human 三层评估体系。
- [ ] `src/ai/eval/citationJudge.ts` 接口存在，`citationJudge.ts` 和 `relevanceJudge.ts` 实现该接口。
- [ ] Dogfood 环境连续 2 周生成有效的 `AiRuntimeReport`，无异常告警。

### 涉及文件
- `scripts/generate-release-evidence-bundle.mjs` 或相关脚本（增加 audit 数据源读取）
- `src/ai/eval/citationJudge.ts`（新增接口）
- `src/ai/eval/citationJudge.ts` / `relevanceJudge.ts`（实现接口）
- `docs/architecture/ai-evaluation-judge-provider-contract.md`（新增 ADR）
- `src/ai/eval/aiRuntimeReport.ts`（确保可被定时触发）

---

## 阶段五：垂直工作流复制（P4，3–4 周，依赖 P2）

### 目标
以 segment_qa 为模板，将 annotation_qa 和 lexeme_candidates 补齐到同等深度。

### 行动项

1. **补齐缺失的闭环**
   - `annotation_qa`：增加 `annotationQaReflection.ts`（检查标注一致性、空标注、语言匹配等）。
   - `lexeme_candidates`：增加 `lexemeCandidatesReflection.ts`（检查词形有效性、POS 合法性、与现有词典冲突等）。
   - 两者都需接入 `sourceResolver.ts`，获取真实的 annotation / lexeme 数据源。

2. **Composed Workflow 健壮性**
   - 当前 `composedWorkflowTemplates.ts` 支持 step1_done → step2 retry，但 annotation_qa / lexeme_candidates 的 step 尚未有独立的 reflection 和 fallback。
   - 为两步/三步组合模板增加每步的 reflection gate。

3. **Eval Suite 补齐**
   - 为 annotation_qa 和 lexeme_candidates 各增加 4+ eval cases，接入 `suite.v1.json`。

### 验收标准
- [ ] `annotation_qa` 和 `lexeme_candidates` 拥有与 `segment_qa` 同等级别的 reflection、fallback、eval suite。
- [ ] Composed workflow（如 `annotation_qa_then_lexeme_candidates`）在 step1 失败时能正确触发 retry，UI 有明确提示。
- [ ] `verticalWorkflowRegistry.ts` 中三个 evalSuiteId 均有对应 cases 在 CI 中运行。

### 涉及文件
- 新增 `src/ai/vertical/annotationQaReflection.ts`
- 新增 `src/ai/vertical/lexemeCandidatesReflection.ts`
- 修改 `src/ai/vertical/sourceResolver.ts`（支持 annotation_qa / lexeme_candidates 数据源解析）
- 修改 `src/ai/vertical/composedWorkflowTemplates.ts`（每步增加 reflection gate）
- 新增 `scripts/agent-evals/cases/annotation-qa-*.json`、`lexeme-candidates-*.json`

---

## 不列入本方案的事项（明确边界）

| 事项 | 原因 |
|------|------|
 MCP Client / A2A 运行时实现 | 生态尚未稳定，且当前无产品需求驱动；保持预留即可 |
| 云端任务恢复 / 跨设备同步 | 属于基础设施大项，需独立规划；当前本地优先架构已满足核心场景 |
| LLM Judge 替换 | 规则 baseline 当前非瓶颈，P4 阶段仅做接口预留 |
| 新增第 4 个垂直工作流 | 先把现有 3 个做深，再扩展 |

---

## 时间线概览

```
Week  1  2  3  4  5  6  7  8  9  10 11 12 13 14
     [====P0====]
           [=======P1=======]
                [====P2====]
                     [====P3====]
                          [=======P4=======]
```

- P0 与 P2 可部分并行（MCP 和 hook 减压互不阻塞）。
- P1 与 P2 可部分并行（segment_qa UI 工作和逻辑下沉可分工）。
- P3 依赖 P1/P2 产生的真实审计数据。
- P4 依赖 P2 的结构稳定。

---

## 成功指标（整体）

| 指标 | 当前 | 目标 |
|------|------|------|
 MCP Server 工具真实度 | 0%（全 mock） | 100%（3 个工具均查真实数据） |
| Release evidence skipped 比例 | ~66%（12/18） | <30% |
| 垂直工作流完整闭环数 | 1（segment_qa） | 3（segment_qa + annotation_qa + lexeme_candidates） |
| useAiChat.ts 行数 | 508 | <350 |
| useAiChat* 派生文件数 | 64 | <50 |
| Agent eval suite 覆盖工作流数 | 1（隐含） | 3（均有专属 cases） |
