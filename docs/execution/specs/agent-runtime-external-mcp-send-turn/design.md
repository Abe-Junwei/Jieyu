---
title: agent-runtime-external-mcp-send-turn design
doc_type: execution-spec-design
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-external-mcp-send-turn-spec
depends_on:
  - ./requirements.md
  - ../../../architecture/ai-agent-runtime-security-local-first.md
  - ../../specs/agent-runtime-external-mcp-http-client/design.md
---

# Design — External MCP Send-Turn (B14)

## 1. 成熟方案扫描 / Research

- 仓库既有：B13 `externalMcpHttpClient`；B11 `exposeExternalMcpToolsToLlm`；Jieyu 工具是文本 JSON `tool_call`（`parseLocalContextToolCallsFromText`），**不是** OpenAI function-calling；`AI_TOOL_CATALOG` 是封闭 SSOT。
- 同类产品：Claude Code / Agent SDK 把 MCP 工具暴露为 `mcp__<server>__<tool>`（非 `[a-zA-Z0-9_-]` 替换为 `_`），权限规则按此前缀过滤。
- 业内规范：MCP tools/list 仍是投毒面（进 prompt 前再走 B11 expose）；guide 用缓存、execute 再联网（Claude 也允许 cached tool list）。
- 公认不可行：把外部名塞进 `AI_TOOL_CATALOG`；在 ChatWindow 热点文件接线；send-turn 每次 `tools/list`；CSP `https:` 通配。
- 潜在的坑：`exactOptionalPropertyTypes` 不可 spread `undefined`；同源编码碰撞须 deny；local 解析先跑，外部名会被丢掉——这是刻意的 local-first。
- 决定：**适配** Claude `mcp__server__tool` 为 `extmcp__<originKey>__<tool>`（origin 身份，避免 display name）；**复用** B13 call + B11 expose；**自研** 文本 JSON 桥，不借 SDK。

## 2. 架构选择

- 落位：`derived`（encode/parse/guide）+ `actions`（execute + cache write）+ 编排层数行路由
- 方案 A：`externalMcpTurnBridge.ts` + persist 注入 guide + streamCompletion 在 local 为空时调用 — **选 A**
- 拒绝：ChatWindow 装配；OpenAI tools 数组；Settings 内联 `fetch`

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `externalMcpTurnBridge.ts` | encode / cache guide / parse / execute | < 220 |
| `externalMcpTrustRegistry.ts` | 可选 `lastToolsJson` 写→readback | 数行 |
| `promptContext.ts` | 第 6 参 `externalMcpToolGuide` 默认空 | 数行 |
| `useAiChat.streamCompletion.ts` | local 空 → bridge | ~15 行 |
| `featureFlags.ts` | `aiExternalMcpSendTurnEnabled` 默认 false | 数行 |

约束自查：编排层不写规则；不引入 `src/features/`；Settings 不新增第 3 层 `border`。

## 4. ADR 引用

- 相关：ADR-0031 CSP（不放宽）；B11/B13 SDD
- 新建 ADR：否（命名约定可随 catalog 演进）

## 5. Feature flag

- Flag：`aiExternalMcpSendTurnEnabled` / `VITE_AI_EXTERNAL_MCP_SEND_TURN_ENABLED`
- 默认：`false`（全部环境）
- 放量：仍受 B11/B13 flag 与 CSP 约束

## 6. 失败模式 / 兼容性

- 旧用户：flag 关 = 现网 prompt/send-turn 字节级不变
- 迁移：`lastToolsJson` 可选，不升 Dexie 版本
- 回滚：关 flag

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/ai/mcp/client src/ai/chat/promptContext.tiered.test.ts src/components/settings/SettingsAiMcpTrustSection.test.tsx src/ai/config/featureFlags.environmentMatrix.test.ts src/db/engine.externalMcpTrust.test.ts` | pass |
| 结构守卫 | `check:architecture-guard` + docs/plans | OK |
| Agent evals | `check:agent-evals:smoke` | OK |
