---
title: 转写语音 ActionId 注册与文案合同
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-04-26
source_of_truth: implementation
---

# 转写语音 ActionId 注册与文案合同

## 适用范围

转写工作区内 **语音意图解析为 `type:"action"`** 时，模型与路由层共用的 **`ActionId` 字符串集合** 必须与 UI 文案键、国际化字典以及 LLM 系统提示中的允许列表 **保持同一集合**。否则会出现：路由拒绝合法意图、语音面板标签缺失、或 LLM 输出在运行时被丢弃。

## 必须同步的工件

| 工件 | 路径 | 说明 |
|------|------|------|
| 规范集合 | `src/services/IntentRouter.ts` | `ACTION_ID_SET`（`isActionId` 的真值来源）。 |
| 展示键 | `src/services/voiceIntentUi.ts` | `ACTION_LABEL_KEYS`：每个 `ActionId` 对应一条 `transcription.voiceAction.*` 的 `DictKey`。 |
| 键声明 | `src/i18n/dictKeys.ts` | 上述 `DictKey` 须在 `DictKey` 联合类型中出现。 |
| 文案 | `src/i18n/dictionaries/en-US.ts`、`zh-CN.ts` | 每个 `DictKey` 须有非空字符串值。 |
| LLM 允许列表 | `src/services/VoiceIntentLlmResolver.ts` | `DEFAULT_SYSTEM_PROMPT` 中含 **「ActionId 仅允许：」** 的逗号分隔列表（与 `ACTION_ID_SET` 集合一致）。 |

## 自动化校验

```bash
npm run check:transcription-text-telemetry-contract
```

实现：`scripts/check-transcription-text-telemetry-contract.mjs`。该检查已并入 `npm run check:architecture-guard`，并随主仓库 **`npm test`** 在 CI 中执行。

## PR / 发布前清单（养成习惯）

1. **推荐一键命令**（ActionId 注册契约 + 语音助手核心 Vitest）：  
   `npm run check:voice-agent-pre-merge`
2. 若只改字典文案、不动 `ActionId` 集合，可仅跑：  
   `npm run check:transcription-text-telemetry-contract`  
   （CI 中已由 `check:architecture-guard` 覆盖契约检查；本地提前跑可减少往返。）
3. 若仅改文案键名而未改 `ActionId` 集合，仍须保证 **五处工件** 与上表一致，脚本会失败并打印缺失/多余项。

## 变更清单（新增或重命名 ActionId）

1. 在 `IntentRouter.ts` 的 `ActionId` 联合类型与 `ACTION_ID_SET` 中同时增删。  
2. 在 `voiceIntentUi.ts` 的 `ACTION_LABEL_KEYS` 中增加对应行，值为新的 `transcription.voiceAction.<id>` 键名（与 camelCase 的 `actionId` 对齐为惯例）。  
3. 在 `dictKeys.ts` 与 `en-US.ts`、`zh-CN.ts` 中增加该键及中英文文案。  
4. 在 `VoiceIntentLlmResolver.ts` 的允许列表字符串中追加同名 id（逗号分隔，顺序可与集合不同，但集合必须相等）。  
5. 本地运行：`npm run check:transcription-text-telemetry-contract` 或 `npm run check:architecture-guard`。

与语音主链、聊天路径的更多上下文见 [voice-unified-chat-path.md](./voice-unified-chat-path.md)。
