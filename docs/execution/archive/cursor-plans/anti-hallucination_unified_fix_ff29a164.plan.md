---
name: Anti-hallucination unified fix
overview: "Systematically address all hallucination-prone scenarios across the AI chat system through a unified 5-layer defense: context grounding, prompt architecture reform, tool invocation guarantee, output validation, and history fidelity."
todos:
  - id: layer1-context-grounding
    content: 第一层：在上下文中注入语段时间表摘要（types + builder + template）
    status: completed
  - id: layer2-prompt-reform
    content: 第二层：提示词架构改革 — 区分查询工具/操作工具，追加通用反幻觉指令
    status: completed
  - id: layer3-truncation-safety
    content: 第三层：截断安全增强 — 工具结果截断时追加警告
    status: completed
  - id: layer4-output-guard
    content: 第四层：输出验证护栏 — 编号列表/伪造时间戳/数字一致性检测
    status: completed
  - id: layer5-summary-fidelity
    content: 第五层：摘要保真增强 — 提高工具结果在摘要中的保留字数
    status: completed
  - id: tests-update
    content: 更新相关测试文件
    status: completed
isProject: false
---

# AI 幻觉全面防治方案

## 根因分析：六大幻觉场景

经过全面排查，幻觉不仅限于"语段时间表伪造"一种情况，共识别出以下六大场景：

### 场景 1：聚合数字 -> 伪造明细列表
**问题**：上下文只给 `utteranceCount=6`、`gaps=7`、`lowConfidence=3` 等聚合数字，模型自行编造对应数量的条目（时间、文本、ID）。
**涉及字段**：`projectStats.utteranceCount`、`projectStats.translationLayerCount`、`waveformAnalysis.gaps/overlaps/lowConfidence`、`utterancesOnCurrentMediaCount`

### 场景 2：提问时系统提示禁止 JSON -> 模型不调工具
**问题**：[`promptContext.ts` 第 13 行](src/ai/chat/promptContext.ts) 明确写「用户只是问候/闲聊/提问/解释或总结时，严禁返回 tool_call JSON，必须返回自然语言」。但查询类工具（`list_utterances`、`search_utterances`）恰恰需要在回答问题时调用。模型遵守"提问不准用 JSON"指令，选择自行编造。

### 场景 3：声学摘要标量 -> 伪造帧级/频谱细节
**问题**：`acousticSummary` 提供 F0 均值/强度均值/MFCC 前 3 系数等**聚合标量**，模型可能据此编造逐帧音高曲线、频谱分析、语音学分析等细节。
**涉及字段**：`acousticSummary` 中所有均值/比率字段、`hotspots`（只有 `kind@time`，无分数）

### 场景 4：对话摘要丢失细节 -> 张冠李戴
**问题**：[`historyTrim.ts`](src/ai/chat/historyTrim.ts) 将旧消息压缩为 140 字/条，再截断为 1200 字总摘要。模型将压缩后的摘要当作精确引用，混淆/编造之前对话中的具体数字、ID 或操作结果。

### 场景 5：工具结果 2000 字截断 -> 数据不全但回答完整
**问题**：[`localContextTools.ts` 第 340 行](src/ai/chat/localContextTools.ts) 将工具 JSON 截断为 2000 字符并附加 `...`。当 `list_utterances` 返回大量数据时，模型看到截断标记却仍然试图"补全"被截断的内容。

### 场景 6：waveformAnalysis 字段歧义
**问题**：`gaps` 的语义是「超过阈值的静音间隙数」，但模型容易理解为「语段之间的全部间隔数」，从而用 `gaps+1` 推算语段总数（如 gaps=7 -> 认为有 8 个语段）。虽然 persona 已有警告，但该警告可能被其他指令淹没。

---

## 统一解决方案：五层防线

### 第一层：上下文夯实（Context Grounding）

**目标**：让模型拿到的不再是"只有数字"，而是"数字 + 足够的真实条目摘要"。

**改动文件**：[`src/pages/TranscriptionPage.aiPromptContext.ts`](src/pages/TranscriptionPage.aiPromptContext.ts)、[`src/ai/chat/chatDomain.types.ts`](src/ai/chat/chatDomain.types.ts)、[`src/ai/chat/promptContext.ts`](src/ai/chat/promptContext.ts)

**改动内容**：
- 在 `AiShortTermContext` 新增 `utteranceTimeline?: string` 字段
- 在 `buildTranscriptionAiPromptContext` 中，从当前 media 的 utterances 构建一个精简时间表字符串，格式如：`#1 00:00.0–00:35.1 "转写文本截断..." | #2 00:35.1–00:48.4 "..." | ...`
- 受 `maxChars` 预算保护（如 800 字符），超出时截断并附注 `(+N more, use list_utterances for full data)`
- 在 `SHORT_TERM_TEMPLATES` 中新增对应模板条目

这样模型即使不调工具，也有真实的语段时间范围，不需要编造。

### 第二层：提示词架构改革（Prompt Architecture Reform）

**目标**：解决"查询工具"和"操作工具"被同一条规则管辖的矛盾。

**改动文件**：[`src/ai/chat/promptContext.ts`](src/ai/chat/promptContext.ts)

**改动内容**：
- 将 `AI_FUNCTION_CALLING_SYSTEM_PROMPT` 第 13 行的规则从：
  > 当用户只是问候/闲聊/提问/解释或总结时，严禁返回 tool_call JSON，必须返回自然语言
  
  改为**显式区分两类工具**：
  > 当用户只是问候/闲聊/提问/解释或总结时，严禁返回**操作类** tool_call JSON（create/delete/set/merge/split/link/unlink/auto_gloss/set_token_*）。但可以且**应当**返回**查询类** tool_call JSON（list_utterances/search_utterances/get_utterance_detail/get_current_selection/get_project_stats/get_waveform_analysis/get_acoustic_summary）以获取准确数据。

- 在 `buildLocalContextToolGuide()` 输出中增加分类标注：

```
Query tools (use freely, even for questions):
- list_utterances(...)
- search_utterances(...)
- get_utterance_detail(...)
- get_current_selection(...)
- get_project_stats(...)
- get_waveform_analysis(...)
- get_acoustic_summary(...)
```

- 在所有 persona 中追加通用反幻觉指令：
  > 当你需要列举具体条目（语段列表/时间范围/ID/文本内容/声学细节）却没有足够数据时，**必须**先调用查询工具获取真实数据，禁止凭聚合数字推测或编造。若工具不可用或结果被截断，明确告知用户数据不完整。

### 第三层：截断安全增强（Truncation Safety）

**目标**：当工具结果被截断时，模型不会"补全"缺失数据。

**改动文件**：[`src/ai/chat/localContextTools.ts`](src/ai/chat/localContextTools.ts)、[`src/ai/chat/agentLoop.ts`](src/ai/chat/agentLoop.ts)

**改动内容**：
- 修改 `formatLocalContextToolResultMessage` 和 `formatLocalContextToolBatchResultMessage`：当 JSON 被截断时，在截断标记后追加显式警告：
  `[DATA TRUNCATED — do NOT fabricate missing items. Tell the user that the full list is too long and suggest using more specific queries or smaller limit/offset.]`
- 在 `buildAgentLoopContinuationInput` 中也增加类似提示。

### 第四层：输出验证护栏（Output Validation Guard）

**目标**：即使前三层未完全阻止幻觉，在输出阶段做最后一道检测。

**改动文件**：[`src/hooks/useAiChat.streamCompletion.ts`](src/hooks/useAiChat.streamCompletion.ts)

**改动内容**：
- 新增 `detectPotentialHallucination(assistantContent, context, calledTools)` 函数
- 检测模式：
  1. **编号列表检测**：正则匹配连续编号列表（如 `1. **00:00...` 或 `#1 ...`），若列表条目数 > 3 且本轮未调用过任何查询工具 -> 标记可疑
  2. **伪造时间戳检测**：正则匹配 `\d{2}:\d{2}\.\d` 格式的时间戳列表，若出现 >= 4 个不同时间戳且未调用 `list_utterances`/`search_utterances` -> 标记可疑
  3. **数字一致性检测**：从上下文中提取 `utterancesOnCurrentMediaCount` 值 N，若模型声称有 M 个语段/句段且 M != N -> 标记可疑
- 检测到可疑内容时，不删除模型输出，而是在末尾追加一行警示：
  `\n\n> ⚠️ 以上列表可能包含不准确的信息。建议使用"列出所有语段"指令获取准确数据。`

### 第五层：摘要保真增强（Summary Fidelity）

**目标**：减少对话摘要丢失关键事实导致的后续幻觉。

**改动文件**：[`src/ai/chat/historyTrim.ts`](src/ai/chat/historyTrim.ts)

**改动内容**：
- 在 `compressMessageContent` 中，对包含工具结果的消息（检测 `Local context tool executed:` 前缀）提高 `maxLen` 到 280 字符（当前 140），保留更多工具返回的真实数据
- 这样当摘要中出现工具调用结果时，关键的 ID/时间/文本片段更不容易被截断

---

## 改动范围总结

| 文件 | 改动类型 |
|------|----------|
| `src/ai/chat/chatDomain.types.ts` | 新增 `utteranceTimeline` 字段 |
| `src/pages/TranscriptionPage.aiPromptContext.ts` | 构建语段时间表字符串 |
| `src/ai/chat/promptContext.ts` | 提示词重构 + 模板 + 反幻觉指令 |
| `src/ai/chat/localContextTools.ts` | 截断安全警告 + 工具分类标注 |
| `src/ai/chat/agentLoop.ts` | 续写提示增强 |
| `src/hooks/useAiChat.streamCompletion.ts` | 幻觉检测护栏 |
| `src/ai/chat/historyTrim.ts` | 工具结果摘要保真 |
| 测试文件 | 对应更新 |
