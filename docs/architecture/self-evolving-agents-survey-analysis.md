---
title: 自演化 AI Agent 架构备选方向
doc_type: architecture-survey-synthesis
status: active
owner: repo
last_reviewed: 2026-05-06
source_of_truth: self-evolving-agents-survey-analysis-2026-05-06
---

# 自演化 AI Agent 架构备选方向

> 来源：Fang et al., *A Comprehensive Survey of Self-Evolving AI Agents*, arXiv:2508.07407 (2025-08)
> 收录日期：2026-05-06
> 文档定位：架构书远期备选方向，非当前执行项

---

## 1. 核心框架（论文摘要）

### 1.1 自演化三定律

| 定律 | 名称 | 含义 |
|------|------|------|
| I | **Endure** (安全适应) | 任何修改中必须保持安全与稳定 |
| II | **Excel** (性能保持) | 在遵守第一定律前提下，保持或增强现有任务性能 |
| III | **Evolve** (自主演化) | 在遵守前两条定律前提下，能自主优化内部组件以适应变化 |

### 1.2 LLM 中心范式四阶段

```
MOP (静态预训练) → MOA (在线适配) → MAO (多智能体编排) → MASE (多智能体自演化)
```

**Jieyu 当前定位**：介于 MAO 与 MASE 之间。已有 `VerticalWorkflowRegistry`（4 个静态工作流）、`localContextTools`（21 个工具）、`sessionMemory`（持久化记忆）、`projectAiMemory`（跨会话长期记忆），但所有配置均为**手动设计且静态部署**。

### 1.3 演化反馈环

```
System Inputs → Agent System → Environment → Optimisers → (feedback) → Agent System
```

演化可针对 Agent System 的任意子组件：
- **Prompts**：系统提示、角色定义、指令模板
- **Memory**：记忆结构、存储策略、检索机制
- **Tools**：工具发现、选择策略、调用参数优化
- **Workflows**：任务分解、拓扑结构、执行顺序
- **Communication**：多 Agent 间通信协议

---

## 2. 与 Jieyu 现状的映射

### 2.1 Prompt 优化

| 论文方法 | 机制 | Jieyu 落点 |
|----------|------|-----------|
| APE / OPRO | 基于验证集评分迭代优化提示 | `buildLocalContextToolGuide()` A/B 测试框架 |
| PromptBreeder | 进化算法发现更优指令 | `systemPrompt` 与 `verticalWorkflow` 角色定义优化 |
| ACE | 上下文作为"战术手册"增量更新 | 扩展 `sessionMemory` 为跨会话 prompt 积累 |

**现状**：`adaptiveInputProfile` 已提取用户意图（9 类）和响应风格偏好，但提示优化完全依赖人工设计，无自动评估-优化闭环。

### 2.2 Memory 演化

| 论文方法 | 机制 | Jieyu 落点 |
|----------|------|-----------|
| RAG 增强 | 动态检索策略自适应 | `sessionMemory` / `projectAiMemory` 多策略检索（BM25/向量/关键词） |
| 记忆写入门控 | 决定什么事实值得长期保存 | 优化 `backgroundMemoryExtractor` 的门控规则 |
| 记忆结构演化 | 自动调整记忆组织结构 | 尚未涉及；远期方向 |

**风险警示**：论文指出记忆演化存在 **reward hacking** 风险（Agent 可能学到错误关联）。Jieyu 的 `backgroundMemoryExtractor` 如果缺乏正确性验证，可能积累错误偏好。

### 2.3 Tool 使用演化

| 论文方法 | 机制 | Jieyu 落点 |
|----------|------|-----------|
| Voyager | 积累可执行技能代码到技能库 | `batchApply` 等高频操作模式 → 可复用批处理模板 |
| ToolGen / STELLA | 生成/扩展新工具 | Jieyu 语言学工具集（`listLayers`、`diagnoseQuality` 等）按 Tool Ocean 模式扩展 |

**现状**：21 个 `localContextTools` 覆盖查询、诊断、批处理；工具集合静态，无自动发现/淘汰机制；工具选择策略是 LLM 直接决策，无基于历史成功率的优化。

### 2.4 推理策略演化

**现状**：`agentLoop` 已采用 ReAct 模式（max 6 steps），`segmentQaReflection.ts` 已引入轻量自检节点。可扩展为有限分支探索（Tree-of-Thought）或每步后增加 self-critique。

---

## 3. 实际落地案例分级

| 成熟度 | 代表系统 | 演化维度 | 状态 |
|--------|----------|----------|------|
| 研究原型 | Voyager、AlphaEvolve、Agent Hospital、STELLA、SEAgent | 高自演化 | 实验室/模拟环境 |
| 生产系统 | GitHub Copilot、OpenAI Deep Research、Perplexity | 离线演化+人工驱动 | 大规模部署 |

**关键结论**：真正闭环自演化的系统目前仍以研究原型为主。工业界主流是「离线演化 + A/B 测试 + 人在回路」。

---

## 4. 安全与伦理约束（前置条件）

在启动任何自演化机制前，必须建立：

1. **版本化沙箱**：演化必须在隔离环境测试，通过回归测试后才能合并
2. **黄金测试集**：固定核心查询，演化必须保持输出质量
3. **人工审查门**：高风险演化（系统提示修改）必须经过人工审批
4. **回滚机制**：演化变更必须在 1 分钟内可回滚
5. **可观测性**：演化决策的完整链路必须可追踪、可审计

论文警示的三类风险：
- **行为漂移** (Behavior Drift)：目标/价值观偏离原始意图
- **灾难性遗忘** (Catastrophic Forgetting)：自我训练导致安全对齐失效
- **奖励黑客** (Reward Hacking)：利用评估漏洞获取高分
- **对齐 Tipping**：发现"不对齐行为更获利"后策略突变

---

## 5. 分阶段落地建议（与现有路线图衔接）

### 5.1 短期（当前 P0–P1 窗口）：低风险的静态优化增强

| 改进项 | 具体方案 | 风险 |
|--------|----------|------|
| Prompt A/B 测试框架 | 为 `buildLocalContextToolGuide()` 和 `systemPrompt` 引入版本控制 + 效果追踪 | 极低 |
| 工具调用成功率追踪 | 每个 `localContextTool` 记录调用次数、采纳率、追问率 | 极低 |
| Agent Loop 路径记录 | 记录每轮对话的 tool 调用序列和决策理由 | 极低 |

### 5.2 中期（P1b–P2 窗口）：受控的自适应机制

| 改进项 | 具体方案 | 论文对应 |
|--------|----------|----------|
| 自适应 Tool Guide | 基于历史成功率动态调整工具指南中各工具的示例权重 | Prompt Optimization |
| Vertical Workflow 动态路由 | 基于 `adaptiveInputProfile` 意图分类置信度动态选择工作流策略 | Workflow 演化 |
| 记忆检索策略优化 | 引入多种检索策略，根据查询类型自动选择 | Memory 演化 |
| 模型选择演化 | 将 `modelSelectionFeedback` 从规则驱动升级为数据驱动 | MOA |

### 5.3 长期（P2+ 窗口）：向 MASE 演进

| 改进项 | 具体方案 | 论文对应 |
|--------|----------|----------|
| 可复用操作模板库 | `batchApply` 等高频模式抽象为可复用模板，用户可保存/分享/评分 | Voyager 技能库 |
| 多 Agent 轻量编排 | 规划 Agent + 检索 Agent + 验证 Agent 的最小多 Agent 系统 | MAO → MASE |
| Prompt 自动优化实验 | 隔离环境中用 OPRO/SPO 方法自动优化系统提示 | PO |
| 跨项目知识迁移 | 项目的 `projectAiMemory` 和成功模板迁移到结构相似的新项目 | 终身学习 |

---

## 6. 与现有计划书的衔接口径

- **不替代现有 P0–P2 路线**：本方向作为 **P2+ 远期备选**，当前执行仍以 `segment_qa` 闭环、EvidencePacket、AdoptionQueue、MCP Server 真实化为优先
- **不做通用 swarm**：与战略规划「不对标」列表一致，不引入 Devin 式自动改仓或通用多 Agent swarm
- **安全优先**：任何自适应功能必须先满足「Endure」原则（三定律 I），即保持现有安全边界（policy / sandbox / confirm / audit）不退化
- **数据驱动**：自演化必须建立在 P2 已建立的评测基线（30+ 语义 case、成本基线、引用准确率）之上，无 baseline 不自演化

---

## 7. 参考

1. Fang, J., et al. (2025). *A Comprehensive Survey of Self-Evolving AI Agents*. arXiv:2508.07407.
2. Gao, H., et al. (2025). *A Survey of Self-Evolving Agents*. arXiv:2507.21046.
3. Wang, G., et al. (2023). *Voyager*. arXiv:2305.16291.
4. Hong, S., et al. (2023). *MetaGPT*. ICLR 2024.
