---
title: agent-runtime-external-mcp-send-turn requirements
doc_type: execution-spec-requirements
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-external-mcp-send-turn-spec
---

# Requirements — External MCP Send-Turn (B14)

## 1. What & Why

- **要做什么**：把 B13 `tools/list` 缓存接到 send-turn：system prompt 展示 namespaced 外部工具；模型用现有文本 `tool_call` JSON 调用时走 B13 `tools/call`。Settings 增加显式「拉取 tools/list」。
- **为什么现在做**：B13 client 已可 list/call，但 LLM 看不见、也调不到这些工具；主路线图下一刀是 ChatWindow/send-turn 接线。
- **不做什么**：不改 `TranscriptionPage.ChatWindow.tsx`；不把外部工具写入 `AI_TOOL_CATALOG`；不引入 SDK / function-calling；不接 Zotero/OpenAlex 专用适配；不改 CSP `connect-src`；不做 B5b。

## 2. 用户场景（≤ 3 条）

1. Flag 关：prompt 不含 `extmcp__` 指南；assistant 文本不触发外部 HTTP。
2. Flag 开且 origin 已启用并有 `lastToolsJson`：prompt 含缓存工具名；本地 `tool_call` 优先于外部。
3. Settings（B13 HTTP flag 开）：对已启用 origin 拉取 `tools/list`，写 `lastToolsJson` → requery。

## 3. 验收标准（可测）

- [ ] `aiExternalMcpSendTurnEnabled` 默认 `false`；flag 关零 guide、零外部 HTTP
- [ ] 成功 `tools/list`（或启用时带 schema）写入 `lastToolsJson`；reload 可读回
- [ ] 指南只用 Dexie 缓存，send-turn persist **不** 发 `tools/list`
- [ ] 本地工具与外部同回合时只跑本地
- [ ] 执行走 B13 client（未启用 origin / HTTP flag 关 → 零 fetch）
- [ ] 不改 ChatWindow；不改 `AI_TOOL_CATALOG`

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Service | `externalMcpTurnBridge.ts` + trust cache | 新增 / 修改 |
| Prompt | `promptContext.ts` + persist opening | 修改（可选 arg） |
| Hook 模块 | `useAiChat.streamCompletion.ts` | 数行路由 |
| UI | `SettingsAiMcpTrustSection.tsx` | 拉取按钮 |
| Flag | `featureFlags.ts` / `vite-env.d.ts` | 新增 |

## 5. 已知风险与依赖

- 依赖 B11 allowlist + B13 HTTP client；CSP 仍拦截未列入 host。
- 回滚：关 `aiExternalMcpSendTurnEnabled`。
