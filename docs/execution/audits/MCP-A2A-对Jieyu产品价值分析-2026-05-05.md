---
title: MCP / A2A 对 Jieyu 产品的价值分析
doc_type: strategic-analysis
status: active
owner: ai-governance
last_reviewed: 2026-05-05
---

# MCP / A2A 对 Jieyu 产品的价值分析

> **分析日期**：2026-05-05  
> **前提**：Jieyu 是桌面端本地优先的语言资料工作平台，AI 定位为「证据型、可审批、可复盘」的专用任务智能体  
> **不对标项**：通用多 Agent swarm、云端多租户、全自动改仓

---

## 1. 一句话结论

| 协议 | 对 Jieyu 有什么用 |
|------|------------------|
| **MCP** | 让 Jieyu 的 AI 能调用外部学术工具（Zotero、文献库、语言数据库），同时让外部 AI（Claude/Cursor）能操作 Jieyu 项目——**解决「数据孤岛」和「工具碎片化」** |
| **A2A** | 让不同角色的 Jieyu 用户（研究者/审校者/社区顾问）的 AI Agent 能相互委托任务——**解决「多角色协作」和「跨工具工作流」** |

**关键发现**：语言学工具的 MCP 生态几乎空白，Jieyu 有**先发优势**成为第一个原生支持 MCP 的语言学工作平台。

---

## 2. MCP 的具体价值

### 2.1 先理解 MCP 是什么

MCP（Model Context Protocol）是 Anthropic 发起、现已捐赠给 Linux Foundation 的协议。简单说：它是 AI 的 **USB-C 接口**。

- 以前：每个工具要给每个 AI 写一套适配（N×M 问题）
- MCP 后：工具实现一次 MCP Server，任何支持 MCP 的 AI 都能调用

```
┌─────────────┐         ┌─────────────┐
│  Claude /   │ ←─────→ │   MCP       │
│  Cursor /   │  std    │   Server    │
│  Jieyu AI   │  protocol│  (工具/数据) │
└─────────────┘         └─────────────┘
```

### 2.2 对 Jieyu 的四大价值

#### 价值一：AI 侧边栏直接查文献（立即有用）

**场景**：用户在分析某语言的声调系统，问 AI：「这种语言的声调类型有什么研究？」

**现状**：AI 只能依赖训练数据中的知识，可能过时、可能编造。

**有 MCP 后**：
1. Jieyu AI 通过 **OpenAlex MCP** 检索最新语言学论文
2. 通过 **Semantic Scholar MCP** 获取引用网络
3. 通过 **arXiv MCP** 查最新预印本
4. 返回结果时每个结论都带 `EvidencePacket`（论文标题、作者、DOI、摘要片段）

**产品形态**：AI 回答底部出现「📚 引用来源」卡片，点击跳转到论文页面或 Zotero。

#### 价值二：写作工作台对接 Zotero（中期有用）

**场景**：用户在 Jieyu 的 `/writing` 页面写田野报告，需要引用文献。

**现状**：手动复制粘贴 BibTeX，或切换回 Zotero 查找。

**有 MCP 后**：
1. Jieyu AI 通过 **Zotero MCP** 直接查询用户的 Zotero 库
2. 输入「引用 Boersma 2018 关于 Praat 的论文」→ AI 自动找到对应条目
3. 生成脚注草稿（带页码占位符），用户确认后插入

**产品形态**：写作页面的 AI 助手多一个「📎 从我的 Zotero 引用」快捷操作。

#### 价值三：Jieyu 自身暴露为 MCP Server（战略级）

**场景**：用户在 Cursor/Claude Desktop 中写代码或分析数据，想直接查询自己的 Jieyu 项目。

**有 MCP 后**：
1. Jieyu 本地运行一个 **MCP Server**（暴露少量只读工具）
2. 用户在 Claude Desktop 中安装「Jieyu MCP」
3. 在 Claude 中问：「我的项目中有多少个未转写的语段？」→ Claude 调用 Jieyu MCP → 返回结果
4. 问：「找出所有缺 gloss 的语段」→ Claude 调用 Jieyu 的 `diagnose_quality` → 返回列表

**为什么这是战略级**：
- **用户粘性**：Jieyu 从「一个应用」变成「用户工作流的底层数据层」
- **生态位**：语言学工具的 MCP 生态几乎空白，Jieyu 是第一个
- **获客**：Cursor/Claude 用户通过 MCP 发现 Jieyu，反向导流

**可暴露的工具清单（只读优先）**：

| MCP Tool | 对应现有代码 | 只读/写 |
|----------|------------|---------|
| `jieyu_list_segments` | `list_units` / `worldModelSnapshot` | 只读 |
| `jieyu_get_segment_detail` | `get_unit_detail` | 只读 |
| `jieyu_search_segments` | `search_units` | 只读 |
| `jieyu_diagnose_quality` | `diagnose_quality` | 只读 |
| `jieyu_list_lexemes` | 词典读模型 | 只读 |
| `jieyu_get_project_stats` | `get_project_stats` | 只读 |

**不写操作**：MCP 暴露阶段只做只读查询，所有写操作仍留在 Jieyu 内部（propose/confirm/audit）。

#### 价值四：语言数据库自动填充（自动化）

**场景**：用户新建项目，输入语言名「Navajo」，需要填写 ISO 代码、语系、使用人口等元数据。

**现状**：用户手动查 Glottolog 或 Ethnologue，复制粘贴。

**有 MCP 后**：
1. Jieyu 通过 **Glottolog MCP**（或自建的 Glottolog 查询层）自动获取：
   - ISO 639-3: `nav`
   - Glottolog ID: `nava1243`
   - 语系: `Athabaskan-Eyak-Tlingit → Southern Athabaskan`
   - 地理坐标、使用人口估算
2. 用户一键确认填充

**产品形态**：语言元数据选择器增加「🔍 从 Glottolog 自动填充」按钮。

### 2.3 已有的学术 MCP 生态（Jieyu 可立即对接）

| MCP Server | 成熟度 | Jieyu 场景 |
|-----------|--------|-----------|
| **Zotero** | ✅ 多个社区实现 | 写作引用 |
| **OpenAlex** | ✅ 社区实现 | 文献发现 |
| **Semantic Scholar** | ✅ 社区实现 | 文献检索 |
| **arXiv** | ✅ 社区实现 | 预印本检索 |
| **Obsidian** | ✅ 社区插件 | 田野笔记同步 |
| **Notion** | ✅ 官方+社区 | 团队文档 |
| **GitHub** | ✅ 官方 | 开源协作 |
| **Glottolog** | ❌ 暂无 | 需自建轻量层 |
| **WALS** | ❌ 暂无 | 需自建轻量层 |
| **PHOIBLE** | ❌ 暂无 | 需自建轻量层 |

---

## 3. A2A 的具体价值

### 3.1 先理解 A2A 是什么

A2A（Agent-to-Agent Protocol）是 Google 发起、已捐赠给 Linux Foundation 的协议。简单说：它是 AI Agent 之间的 **通用语言**。

- MCP：一个 AI 调用一个工具
- A2A：一个 AI 把任务委托给另一个 AI

```
┌─────────────────────────────────────────────────────────┐
│  A2A (Agent ↔ Agent)                                    │
│                                                         │
│  ┌─────────────┐      tasks/send      ┌─────────────┐  │
│  │ 研究者 Agent │  ─────────────────→  │ 审校者 Agent │  │
│  │ (Jieyu 本地) │                      │ (远程实例)   │  │
│  └──────┬──────┘                      └──────┬──────┘  │
│         │                                     │         │
│         ▼  MCP (各自调用自己的工具/数据)       ▼         │
│  ┌─────────────┐                      ┌─────────────┐  │
│  │ Jieyu DB    │                      │ Jieyu DB    │  │
│  │ Zotero      │                      │ Praat       │  │
│  │ Glottolog   │                      │ ELAN export │  │
│  └─────────────┘                      └─────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 对 Jieyu 的三大价值

#### 价值一：多角色审校工作流（核心场景）

Jieyu 已有 Supabase 协作云（realtime 同步、presence、冲突解决）。A2A 在此基础上给每个角色加一个 AI Agent：

**场景**：研究者完成一批语段转写和标注，需要审校。

**无 A2A**：
1. 研究者手动标记「待审校」
2. 审校者打开项目，逐条查看
3. 发现问题，写评论，研究者再修改

**有 A2A**：
1. 研究者的 Jieyu Agent 生成「审校任务包」：包含待审语段、标注规范、重点检查项
2. 通过 A2A `tasks/send` 推送给审校者的 Jieyu Agent
3. 审校者 Agent 本地运行 `annotation_qa` workflow，自动检查：
   - 缺翻译的语段
   - gloss 不一致
   - 时间码异常
4. 审校者 Agent 返回 Artifact： findings 列表 + 修改建议
5. 研究者收到 Artifact，逐条采纳/忽略/复制（走现有的 `AdoptionQueue`）

**产品形态**：项目页面增加「🔄 发起审校」按钮，选择审校者后自动打包任务。

#### 价值二：社区语言顾问异步协作（田野场景）

**场景**：研究者在城市，社区顾问在偏远地区，网络不稳定。

**有 A2A + Jieyu PWA**：
1. 研究者 Agent 打包「发音验证任务」（3 个语段 + 问题：「这个词的声调对吗？」）
2. A2A 任务进入队列，社区顾问的 Jieyu PWA 离线缓存
3. 社区顾问联网后，Jieyu Agent 自动接收任务
4. 顾问听录音、确认/修正、返回语音批注 Artifact
5. 研究者 Agent 收到结果，更新语段状态

**关键适配**：A2A 的任务生命周期（created → working → input-required → completed）天然适配 Jieyu 的「离线-在线」切换架构。

#### 价值三：跨工具工作流（ELAN ↔ Jieyu ↔ FLEx）

**场景**：团队有人用 ELAN 做细粒度时间轴标注，有人用 Jieyu 做 AI 辅助转写，有人用 FLEx 做词典。

**无 A2A**：
- 靠文件导入/导出（.eaf → Jieyu → LIFT）
- 版本混乱、时间码丢失、格式不兼容

**有 A2A**：
1. Jieyu Agent 完成 AI 转写后，通过 A2A 委托 ELAN Agent：「请检查时间码对齐」
2. ELAN Agent 返回时间码修正建议 Artifact
3. Jieyu Agent 采纳修正，再委托 FLEx Agent：「请更新词典候选」
4. FLEx Agent 返回 LIFT 更新 Artifact

**现实约束**：ELAN/FLEx 本身没有 A2A 能力，所以需要 Jieyu 作为「桥梁」——Jieyu 导出 .eaf/.flextext，外部工具处理后返回，Jieyu 再导入。A2A 的任务格式标准化了这个往返流程。

---

## 4. 什么时候该上、什么时候不该上

### 4.1 MCP：建议 P1 启动（3-6 个月内）

| 优先级 | 事项 | 理由 |
|--------|------|------|
| **P0（现在）** | 在 `AiToolRegistry` shadow 阶段预留 MCP schema 兼容 | 零成本，为未来留窗口 |
| **P1（3 个月）** | 自建轻量 MCP Client，对接 Zotero + OpenAlex | 写作/文献场景立即可用 |
| **P1（3 个月）** | Jieyu 暴露只读 MCP Server（6 个工具） | 战略差异化，用户粘性 |
| **P2（6 个月）** | 自建 Glottolog/WALS/PHOIBLE 查询层（兼容 MCP 格式） | 语言元数据自动填充 |
| **P2（6 个月）** | 对接 Obsidian MCP（田野笔记同步） | 个人知识管理闭环 |

### 4.2 A2A：建议 P2 观望（6-12 个月后）

| 优先级 | 事项 | 理由 |
|--------|------|------|
| **P2（6 个月）** | 跟踪 A2A 生态成熟度 | A2A 2025 年 4 月才发布，生态尚早 |
| **P2（6 个月）** | 在 `VerticalWorkflowRegistry` 中预留多 Agent 编排接口 | 不实现 A2A，但数据结构兼容 |
| **P3（12 个月）** | 实验性实现：研究者 → 审校者 的 A2A 任务委托 | 需 Supabase 协作云稳定运行后再叠加 |
| **P3（12 个月）** | 评估 ELAN/FLEx 是否出现 A2A 适配器 | 如果传统工具不跟进，A2A 价值受限 |

**为什么 A2A 比 MCP 晚**：
1. MCP 生态已经成熟（9700 万月下载量，150+ 企业支持 A2A 但主要是大企业内部）
2. Jieyu 的核心场景是「单用户 + 本地优先」，多 Agent 协作是增量而非刚需
3. A2A 需要所有参与方都支持，而语言学工具链（ELAN/FLEx/Praat）都是桌面应用，短期内不会接入 A2A
4. Jieyu 的 Supabase 协作云已能解决 80% 的协作需求，A2A 是剩下的 20%

### 4.3 不该上的场景

| 场景 | 原因 |
|------|------|
| 用 A2A 做「通用多 Agent swarm」 | 与产品定位冲突，不做通用自主代理 |
| 用 MCP 暴露写操作（创建/修改/删除语段） | 安全风险高，写操作必须留在 Jieyu 内部的 confirm/audit 链路 |
| 用 MCP 替代现有的 `toolCallSchemas.ts` | 内部工具格式不需要标准化，MCP 只用于「外部交互」 |
| 用 A2A 做云端多租户调度 | 不在本阶段规划内 |

---

## 5. 与现有路线图的衔接

### 5.1 不冲突

当前路线图明确「不做通用 swarm、不做云端多租户、不替代现有主链」。MCP/A2A 的推荐落地方式完全符合：
- MCP 是**外部工具接入层**，不影响内部 `useAiChat` 主链
- A2A 是**协作增强层**，不替代 Supabase 协作云
- 两者都是**增量扩展**，不是重构

### 5.2 可自然延伸的现有设计

| 现有设计 | 如何延伸到 MCP/A2A |
|----------|-------------------|
| `AiToolRegistry` shadow | 输出时同时生成 MCP Tool Schema |
| `EvidencePacket` | MCP 调用返回的结果自动包装为 EvidencePacket |
| `VerticalWorkflowRegistry` | workflow 定义中增加 `mcpTools` 和 `a2aAgentRoles` 字段 |
| `TaskRunner` + checkpoint | 长周期 A2A 任务天然适配 durable task 模型 |
| `resolveExecutionPolicy` | MCP 调用同样经过 policy gate（只读 = low risk） |
| `featureFlags` | `mcpClientEnabled`、`mcpServerEnabled`、`a2aAgentEnabled` 作为工业开关 |

### 5.3 新增工作量估算

| 事项 | 工作量 | 依赖 |
|------|--------|------|
| `AiToolRegistry` MCP schema 兼容 | 0.5 周 | 无 |
| 自建 MCP Client（Zotero + OpenAlex） | 2 周 | 需确认 Zotero MCP 的稳定性 |
| Jieyu 只读 MCP Server（6 工具） | 2-3 周 | 需设计认证/权限模型 |
| Glottolog 查询层（MCP 兼容） | 1 周 | 需评估 Glottolog API 限制 |
| A2A 预留接口（无实现） | 0.5 周 | 无 |
| **合计（P1 范围）** | **6-7 周** | 可分批交付 |

---

## 6. 竞品视角：如果 Jieyu 不上 MCP/A2A

| 竞品/参照 | 动态 | 对 Jieyu 的威胁 |
|-----------|------|----------------|
| **NotebookLM** | Google 原生，深度集成 Google Scholar / Drive MCP | 如果 Jieyu 不能查文献，AI 回答的「证据感」会弱于 NotebookLM |
| **Cursor + MCP** | 开发者已通过 MCP 接入各种数据库和文档 | 语言学家可能直接在 Cursor 中写脚本处理语料，绕过 Jieyu |
| **UralicNLP + MCP** | 已有论文实现 UralicMCP（形态分析、词典工具） | 证明「语言学 + MCP」已被验证，Jieyu 不跟进会落后 |
| **ELAN/FLEx 插件生态** | 如果未来出现 ELAN MCP 插件 | Jieyu 的互操作优势会被削弱 |

**结论**：MCP 不是「要不要上」的问题，是「什么时候以什么范围上」的问题。晚 6-12 个月可能丧失先发优势。

---

## 7. 执行建议

### 第一步（现在）：零成本预留

在 `AiToolRegistry` shadow 阶段增加一个函数：

```typescript
// src/ai/vertical/mcpCompatibility.ts
export function toMcpToolSchema(tool: AiToolPolicyEntry): McpToolSchema {
  return {
    name: tool.toolName,
    description: tool.description,
    inputSchema: toolCallSchemas[tool.toolName],
  };
}
```

不引入任何 MCP runtime 依赖，只保证 schema 结构对齐。

### 第二步（P1）：MCP Client 轻量接入

1. 选择 **Zotero MCP** 和 **OpenAlex MCP** 两个最成熟的 Server
2. 在 AI 侧边栏增加「文献检索」workflow
3. 检索结果自动包装为 `EvidencePacket`

### 第三步（P1）：Jieyu MCP Server（只读）

1. 用 `@modelcontextprotocol/sdk` 实现本地 HTTP Server（或 stdio）
2. 暴露 6 个只读工具
3. 认证：项目级 token（用户手动复制到 Claude Desktop/Cursor）
4. 权限：只读，不写

### 第四步（P2）：观察 A2A 生态

1. 每季度 review 一次 A2A 的采用情况
2. 当 ELAN/FLEx/Praat 社区出现 A2A 讨论时，启动适配评估
3. 优先在 Supabase 协作云的「审校」场景中实验 A2A

---

## 8. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-05-05 | 初版：基于语言学工具生态调研、学术 MCP 生态现状、A2A 协议分析完成 |
