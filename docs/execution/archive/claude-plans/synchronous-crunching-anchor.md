# AI 混合提示词格式问题修复计划

## 问题描述
1. **重复前缀**：出现"你可能想问：问：..."的重复前缀
2. **中间空格**：提示词中有不该出现的空格

---

## 问题 1：重复前缀 "你可能想问：问"

### 根因
- `buildRecommendedPlaceholder` 在 `src/i18n/aiChatCardMessages.ts` 中会给建议添加前缀如 "问：润色..."
- 这个带前缀的 `primarySuggestion` 被传递给 `buildFallbackRecommendations`（在 `src/i18n/aiChatHybridMessages.ts` 中）
- UI 层又用 `recommendationTitle`（"你可能想问："）作为前缀
- 导致最终显示："你可能想问：" + "问：润色..." = "你可能想问：问：润色..."

### 修复方案
在 `src/i18n/aiChatCardMessages.ts` 的 `buildRecommendedPlaceholder` 函数中，`primarySuggestion` 应该存储**不带前缀**的原始建议，让 UI 层统一添加前缀。

具体修改 `src/i18n/aiChatCardMessages.ts`：
- 第 63-69 行：`getPlaceholderPrefix` 返回的前缀只用于显示，不应混入 `primarySuggestion`
- 需要在构建 `primarySuggestion` 时使用原始文本（不含前缀）

---

## 问题 2：提示词中间出现空格

### 根因
- `clipText`（第 44-49 行）和 `compactText`（`AiHybridRecommendationService.ts` 第 60-64 行）使用 `replace(/\s+/g, ' ')` 规范化内部空格
- 但这个正则**只处理连续空白符，不去除首尾空格**
- 如果 `selectedTimeRangeLabel` 带有尾随空格，会被保留并出现在 scope 中

### 修复方案
在 `clipText` 和 `compactText` 函数的 `replace` 之后添加 `.trim()`：

```ts
// 修改前
const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();

// 已经是 .trim() 了，但需要检查是否所有调用路径都正确
```

需要检查 `src/i18n/aiChatCardMessages.ts` 第 87 行 scope 构建处，确保 `selectedTimeRangeLabel` 被正确 trim。

---

## 关键文件
- `src/i18n/aiChatCardMessages.ts` - `buildRecommendedPlaceholder` 函数（重复前缀问题）
- `src/i18n/aiChatHybridMessages.ts` - `buildFallbackRecommendations` 函数（传递带前缀的 primarySuggestion）
- `src/services/AiHybridRecommendationService.ts` - `compactText` 函数（空格处理）

---

## 验证方法
1. 运行相关测试：`npm test -- --testPathPattern="useAiChatHybridRecommendations|AiHybridRecommendationService"`
2. 手动在 AI 输入面板测试不同场景的建议生成
3. 检查生成的提示词是否还有重复前缀和多余空格
