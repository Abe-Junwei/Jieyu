# Plan: 审查《AI 智能体架构改进方案-2026-05-06》

## 审查原则
仅就本文档自身的**内在一致性、逻辑自洽性、表达清晰度、结构合理性**进行审查。不涉及代码库事实验证，不与其他文档对账。

---

## 审查方法
1. 逐节检查阶段目标、行动项、验收标准、PR 分解之间的纵向一致性
2. 检查文档内部的交叉引用、编号、列表是否自洽
3. 识别表达模糊、不可衡量、自相矛盾的条款
4. 发现结构性遗漏（有行动项无验收、有目标无 PR、有契约无映射等）

---

## 发现 1：P2a 与 P2b 的边界模糊

### 位置
§三 阶段三 行动项 1（P2a）与行动项 2（P2b）

### 问题
- P2a："policy 判断、prompt 构建、vertical envelope 组装、reflection/fallback 映射 等无 React 依赖的纯函数 → 下沉"
- P2b："`useAiChat.agentLoopRunner.ts`：先抽内部 helper 与类型契约"；"`useAiChat.toolDecisionPipeline.ts`：先下沉可复用 policy/adapter 片段"

两者都涉及"从 hooks 层提取可复用代码并下沉"，区别仅在于 P2a 提"纯函数"、P2b 提"helper"。但"纯函数"和"helper"在工程实践中没有明确分界：
- agentLoopRunner 的"内部 helper"是否包含纯函数？
- toolDecisionPipeline 的"policy/adapter 片段"是否就是 P2a 所说的"policy 判断"？

### 影响
执行时可能产生分歧：某段代码该在 P2a 抽还是 P2b 抽？ reviewer 可能因标准不一而要求重做。

### 建议
明确定义边界：

> **P2a**：提取**完全不依赖 React/hooks 类型系统**的纯函数（输入输出明确、无副作用、无 useState/useCallback 等）。例如：prompt 组装、envelope 格式化、fallback 文案映射、reflection result → DTO 转换。
>
> **P2b**：提取**依赖 hooks 类型但无 React runtime 依赖**的 helper（消费 hook 类型定义、返回非 JSX 数据结构）。例如：agentLoopRunner 的 checkpoint 序列化逻辑、toolDecisionPipeline 的策略矩阵查找函数。

---

## 发现 2：P0 行动项 4（信任边界）缺少 PR 与验收标准

### 位置
§三 阶段一 行动项 4 + §九 PR 分解

### 问题
P0 行动项 4 包含四项要求：
1. 复用 `auth.ts` 的 Bearer token 校验（401 拒绝）
2. 仅本机 loopback（默认 `127.0.0.1`）
3. 单线程串行处理
4. limit/offset 上限与超时

但：
- §九 P0 PR 包中，PR-P0-1（门面）、PR-P0-2（tools 接门面）、PR-P0-3（runtime scope + flag）**均不涉及**信任边界
- P0 验收标准 6 条中也**没有任何一条**验证信任边界（无 auth、无 loopback、无并发限制、无超时）

### 影响
信任边界是 MCP Server 的**安全基线**，如果没有明确验收，可能出现：
- tools 已接真实查询但 auth 未生效
- 无 loopback 限制导致可被局域网访问
- 无并发/超时限制导致资源耗尽

### 建议
**方案 A（推荐）**：新增 PR-P0-4 或并入 PR-P0-3：
- 范围：`src/ai/mcp/server/auth.ts`、`src/ai/mcp/server/McpServer.ts`
- 改动：确认 Bearer 校验生效、loopback 绑定、limit/offset 钳制、超时处理
- 验证：`npx vitest run src/ai/mcp/server/auth.test.ts`
- 验收标准新增："未授权请求返回 401；非 loopback 请求被拒绝；limit >100 或 offset >1000 时返回错误；tools/call 超时 30s"

**方案 B**：将信任边界从 P0 移至 P3（运行治理），但这会推迟安全基线的验收，不推荐。

---

## 发现 3：P2 行动项 4（Voice Agent 同步减压）有行动项但无验收标准

### 位置
§三 阶段三 行动项 4

### 问题
文档花了一段描述 Voice Agent 的减压方向：
> "`useVoiceAgent.ts` 当前 443 行（上限 930），`VoiceAgentService.ts` 1002 行（上限 1100）。STT 引擎切换策略、听写管线等进一步拆分为独立 service。"

但 P2 的 5 条验收标准中**没有一条**涉及 Voice Agent。

### 影响
Voice Agent 减压可能成为"说说而已"的行动项——做了算做，没做也不影响 P2 验收通过。

### 建议
增加至少一条 Voice Agent 验收标准：

> - [ ] `VoiceAgentService.ts` 行数从 1002 降至 <950，或新增 `src/services/stt/` 下至少 1 个独立 service 文件收纳 STT 引擎切换逻辑
> - [ ] 新增/拆分后的 service 有独立测试覆盖

---

## 发现 4：P1 多条验收标准不可衡量

### 位置
§三 阶段二 验收标准

### 问题
以下验收标准缺乏明确的衡量方式：

| 条款 | 问题 |
|------|------|
| "EvidencePacket 与 SourceSet 绑定契约已固化" | "固化"如何衡量？是字段定义完成？是 ADR 发布？是代码实现？ |
| "citation、audit、runtime report 使用同一来源口径" | "同一口径"如何验证？人工对账？自动 diff？ |
| "Eval case 模板已定义（字段、threshold、trajectorySignals）" | "已定义"是文档层面还是代码层面？谁来确认模板完整？ |
| "Segment QA 至少包含 6 条语言资料 golden cases" | 加上前面 4 条覆盖场景，总共是 10 条还是 6 条？golden cases 和覆盖场景的关系未说明 |

### 建议
逐条修订为可衡量表述：

| 原条款 | 建议修订 |
|--------|---------|
| "EvidencePacket 与 SourceSet 绑定契约已固化" | "`EvidencePacketV0` 已新增 `sourceSetSnapshot` 字段（或 backward-compatible formatter 已实现），且 `src/ai/vertical/evidencePacket.test.ts` 中有字段存在性断言" |
| "citation、audit、runtime report 使用同一来源口径" | "`citation[].sourceId`、`evidencePacket.sourceSetSnapshot`、`audit.toolCall.sourceRefs` 三个字段使用同一 `SourceRef` 类型定义，编译时类型一致（`npm run typecheck` 通过）" |
| "Eval case 模板已定义" | "`scripts/agent-evals/cases/README.md` 或 `docs/adr/00xx-vertical-workflow-eval-template.md` 已发布模板，且 segment_qa 的 6 条 case 均按该模板字段填写" |
| "Segment QA 至少包含 6 条语言资料 golden cases" | "segment_qa eval suite 共 **≥10 条 cases**：4 条基础覆盖场景（有 evidence/无 evidence/低置信/越界）+ 6 条语言资料 golden cases（断句/跨层/gloss-POS/混合脚本/空引用/无证据拒答），全部在 `suite.v1.json` 中登记且 CI 通过" |

---

## 发现 5：P3 "缺陷 skip"范围不明确

### 位置
§三 阶段四 行动项 1 + 验收标准

### 问题
行动项 1 列出 5 个具体缺陷 skip 卡片：
- `c5.background-memory-extraction`
- `c7.coordination-lite`
- `c8.user-directive-governance`
- `f3.durable-orchestration`
- （隐含 `RAG-shape-telemetry`，见验收标准）

验收标准说：
> "Release evidence 中**缺陷 skip**（`background-memory-extraction`、`coordination-lite`、`user-directive-governance`、`durable-orchestration`、`RAG-shape-telemetry`）在 dogfood 环境降至 0"

但 P3 行动项 5 又定义了 skip taxonomy：
> "`audit_missing`、`schema_mismatch`、`input_read_error` 计入缺陷 skip"

这里存在两种"缺陷 skip"定义：
- **定义 A（验收标准）**：特指这 5 张卡片
- **定义 B（taxonomy）**：按原因分类（audit_missing 等）

如果未来出现第 6 张缺陷 skip 卡片（如 `c6.some-new-audit`），按定义 A 不算 P3 责任，按定义 B 算。

### 建议
统一为 taxonomy 定义，并修订验收标准：

> - [ ] Release evidence 中所有因 `audit_missing`、`schema_mismatch`、`input_read_error` 导致的 skipped 卡片在 dogfood 环境降至 **0**
> - [ ] 当前已知的 5 个缺陷 skip（`c5`、`c7`、`c8`、`f3`、`RAG-shape-telemetry`）全部修复并有对应 audit 数据源

---

## 发现 6：P4 行动项 4（reflection gate）与验收标准中的"retry"概念混淆

### 位置
§三 阶段五 行动项 4 + 验收标准

### 问题
行动项 4：
> "为 `annotation_qa_then_lexeme_candidates`、`segment_qa_then_annotation_qa_then_lexeme_candidates` 每步增加 **reflection gate**"

验收标准：
> "Composed workflow **step1 失败时能正确触发 retry**，UI 有明确提示"

"reflection gate"和"retry"是两个不同概念：
- reflection gate：streaming 完成后自检，若发现问题则标记 flagged（可能触发 retry，也可能仅提示用户）
- retry：自动重新执行某一步

文档没有说明 reflection gate 触发的是自动 retry、用户确认后的 retry，还是仅标记不 retry。如果 step1 的 reflection gate 只是标记问题而不自动 retry，验收标准中的"正确触发 retry"就无法达成。

### 建议
明确 composed workflow 的 retry 策略：

> **行动项 4 修订**：
> - composed workflow 每步增加 reflection gate
> - reflection flagged 时的行为：自动 retry（最多 1 次）→ 仍 flagged 则进入用户确认分支
> - 或：reflection flagged 时直接进入用户确认分支，不自动 retry
>
> **验收标准修订**：
> - [ ] Composed workflow step1 reflection flagged 时，按上述策略正确处理（自动 retry 或进入用户确认），UI 展示当前状态

---

## 发现 7：§9.8 原则与 PR 分解中的命令不一致

### 位置
§9.8 统一验证命令基线 + §九 PR 分解

### 问题
§9.8 明确声明：
> "除非脚本尚未注册，否则不再在规划里优先写 `node scripts/*.mjs` 直跑命令"

但以下 PR 仍使用了直跑命令：
- PR-P3-1：`node scripts/generate-release-evidence-bundle.mjs`
- PR-P3-2：`node scripts/check-llm-as-judge-relevance.mjs`（括号内"如适用"）
- PR-P3-3：`node scripts/run-agent-evals.mjs`

其中 PR-P3-3 的 `run-agent-evals.mjs` 与 §9.8 推荐的 `npm run check:agent-evals` 可能是同一脚本的不同调用方式。

### 建议
统一替换为 npm script：
- PR-P3-1：`npm run export:release-evidence:core`（或新增 `npm run generate-release-evidence`）
- PR-P3-2：保留括号内说明，但主命令用 `npm run check:agent-evals`
- PR-P3-3：`npm run check:agent-evals`

---

## 发现 8：§11 风险排序与时间线存在张力

### 位置
§十一 + §五 + §九

### 问题
§11.1 Top 5 排序：
1. PR-P0-2（MCP tools 接门面）— 不可延误
2. PR-P1-1（source scope + evidence 绑定）— 不可延误

但 §五 时间线显示 P1 从 **Week 3** 开始，§九 M2（Week 3-4）才包含 PR-P1-1。

如果 PR-P1-1 是"不可延误"级，为什么要等到 Week 3-4 才开始？这与"不可延误"的语义矛盾。

### 建议
**方案 A**：将 PR-P1-1 提前到 M1（Week 1-2），与 P0 并行启动。理由：
- P1-1 的 source scope DTO 和 evidence 绑定契约是纯设计工作，不依赖 P0-2 的 MCP tools 真实化
- P1-1 与 P0-1（查询门面）有知识共享（都涉及 `sourceResolver.ts` 和 scope 概念），并行可互相验证

**方案 B**：如果资源限制必须排期到 M2，则将 PR-P1-1 的延误容忍度从"不可延误"改为"可短延（1 周内）"。

---

## 发现 9：§一 1.4 与 §四 的"不吸收/不列入"列表不一致

### 位置
§一 1.4 末尾 + §四 表格

### 问题
§一 1.4 明确不吸收（6 项）：
1. 通用多智能体 swarm
2. Devin 式自动改仓
3. 云端多租户 agent runtime
4. 远程 MCP transport
5. A2A 运行时
6. LLM Judge 全面替换

§四 不列入（6 项）：
1. MCP Client / A2A 运行时实现
2. 云端任务恢复 / 跨设备同步
3. LLM Judge 替换
4. 通用多智能体 swarm / Devin 式自动改仓
5. 新增与语言资料无关的第 4 个垂直工作流
6. 远程 MCP transport

**差异**：
- §四 少了"云端多租户 agent runtime"（但多了"云端任务恢复/跨设备同步"，实质相同）
- §四 将 A2A 运行时与 MCP Client 合并为一条，§一 1.4 中 A2A 是单独一项
- §四 多了"新增与语言资料无关的第 4 个垂直工作流"

这 6 项列表在两个位置不完全一致，读者可能困惑：到底哪 6 项是不做的？

### 建议
统一为同一列表，并在 §四 中增加注释：

> "以上 6 项与 §一 1.4'明确不吸收'列表一致，仅合并了同类项并补充了垂直工作流边界。"

或直接引用：

> "不列入本方案的事项同 §一 1.4，另补充：新增与语言资料无关的第 4 个垂直工作流。"

---

## 发现 10：§10.1 UX Contract 缺少"契约 → 阶段"映射

### 位置
§十 10.1

### 问题
§10.1 定义了 6 条统一体验契约，非常全面。但文档没有说明每条契约在 P0-P5 的哪个阶段落地：

| 契约 | 主要落地阶段 |
|------|------------|
| Source Scope 可见 | P1（最小可解释面）、P5（完整化） |
| Evidence 口径一致 | P1（绑定契约） |
| 低置信与无证据状态一致 | P1（fallback UX）、P4（annotation/lexeme 复制） |
| 写入门禁一致 | 已有（T3/T4），P4  AdoptionQueue 复用 |
| 结果动作一致 | P1（copy/jump）、P4（accept/ignore） |
| 失败可解释性一致 | P1（reflection 面板）、P3（explainability DTO） |

没有这个映射表，执行团队难以判断"当前阶段是否已覆盖某条契约"。

### 建议
在 §10.1 末尾增加映射表（如上），或在各阶段（P1/P3/P4/P5）的行动项中显式引用对应契约编号。

---

## 发现 11：00xx ADR 占位符未解释

### 位置
§三 P3、P4、§十 10.1

### 问题
文档多次出现 `docs/adr/00xx-*.md` 作为未来产出物：
- P3："新增 ADR：`docs/adr/00xx-ai-evaluation-judge-provider-contract.md`"
- P3："`docs/adr/00xx-vertical-workflow-template-contract.md`"
- §10.1："`docs/adr/00xx-vertical-workflow-template-contract.md`"

"00xx"对熟悉团队的人可能是"未分配编号"的 obvious 表达，但对新人或外部读者不透明。

### 建议
增加一处注释：

> "注：`00xx` 表示 ADR 编号待分配，实际创建时应取当前最新 ADR 编号 +1（例如若最新为 ADR-0029，则取 0030）。"

或更直接：给出建议编号（如 0030、0031），并在文档顶部维护一个"建议 ADR 编号表"。

---

## 发现 12：P5 缺少前置数据可用性分析

### 位置
§三 阶段六

### 问题
P5 要产出 `elan_flex_compatibility` workflow，覆盖 5 类 finding（tier 映射、词条冲突、时间码缺口、gloss/POS 不一致、受控词表不一致）。

但文档没有分析：
1. 当前系统是否已有 ELAN/FLEx 数据（导入的 EAF、FLEx 导出等）
2. 如果没有已有数据，workflow 的输入来源是什么
3. `sourceResolver.ts` 当前是否能解析 ELAN/FLEx 引用格式

这导致 P5 的"首版产出"可能因缺乏输入数据而无法验证。

### 建议
在 P5 前增加前置检查：

> **P5 启动前置条件**：
> - 确认系统中至少有一份 EAF 样本和一份 FLEx lexeme 样本可用于 fixture
> - 确认 `sourceResolver.ts` 支持 ELAN tier 和 FLEx entry 的引用解析，或需新增适配器
> - 若不满足，P5-1 应调整为"补最小 EAF/FLEx 解析器 + fixture"，而非直接产出 compatibility report

---

## 总结

### 文档质量
整体质量高，阶段划分清晰，PR 分解粒度合理，风险表和成功指标量化充分。外部调研和工业对标吸收了适量的参考样本，未过度膨胀。

### 核心缺陷（按严重性）

| # | 缺陷 | 严重性 | 类型 |
|---|------|--------|------|
| 1 | P0 信任边界无 PR、无验收标准 | 🔴 高 | 安全缺口 |
| 2 | P2a/P2b 边界模糊 | 🟡 中 | 执行歧义 |
| 3 | P1 多条验收标准不可衡量 | 🟡 中 | 验收模糊 |
| 4 | P4 reflection gate 与 retry 概念混淆 | 🟡 中 | 逻辑不一致 |
| 5 | §11 PR-P1-1 为"不可延误"但时间线排 Week 3-4 | 🟡 中 | 优先级/时间线张力 |
| 6 | P2 Voice Agent 有行动项无验收 | 🟢 低 | 遗漏 |
| 7 | P3 缺陷 skip 定义双轨 | 🟢 低 | 定义不一致 |
| 8 | §9.8 命令原则与 PR 分解不一致 | 🟢 低 | 格式不一致 |
| 9 | §一 1.4 与 §四 列表不一致 | 🟢 低 | 交叉引用不一致 |
| 10 | §10.1 缺少契约-阶段映射 | 🟢 低 | 结构缺失 |
| 11 | 00xx 占位符未解释 | 🟢 低 | 表达不透明 |
| 12 | P5 缺少前置数据可用性分析 | 🟢 低 | 风险预判不足 |

### 最需优先修正的 3 项
1. **P0 信任边界补上 PR 和验收标准**（安全基线不可遗漏）
2. **P1 验收标准逐条可衡量化**（否则 3-4 周工期无法有效验收）
3. **P2a/P2b 边界明确定义**（否则提取工作可能重复或遗漏）
