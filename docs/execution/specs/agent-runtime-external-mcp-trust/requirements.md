---
title: agent-runtime-external-mcp-trust requirements
doc_type: execution-spec-requirements
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-external-mcp-trust-spec
---

# Requirements — External MCP Trust (B11)

## 1. What & Why

- **要做什么**：给外部 MCP client 加 origin allowlist；未登记 / 未启用的 server 的 `tools/list` schema **不得**进 LLM；首次启用经 A9 扫描 tool 描述。
- **为什么现在做**：A9 已进 main；主路线图 Wave 4 下一刀；C1 外连 MCP 硬前置。
- **不做什么**：不实现 outbound HTTP MCP client（B12）；不引入 mcp-doorman / Veil 代理依赖；不改 ChatWindow；不改 inbound Jieyu MCP server 只读合同。

## 2. 用户场景（≤ 3 条）

1. Flag 关：任何外部 MCP schema 对模型为零暴露（与现网一致）。
2. 用户在设置里粘贴 `https://` origin 并启用：写 Dexie → reload → 该 origin 才可把只读 tools 交给 LLM；审计行可 readback。
3. 未登记 origin 或 tool 描述命中 A9 注入规则：deny，schema 不进 LLM。

## 3. 验收标准（可测）

- [x] 未登记 / 未启用 / flag off → `exposeExternalMcpToolsToLlm` 返回空
- [x] 启用写 → Dexie requery readback `enabled: true`
- [x] 首次启用带 schema 时走 `inspectInbound`；block 则不启用
- [x] 身份用规范化 origin URL，不用 display name
- [x] `aiExternalMcpTrustEnabled` 默认 `false`
- [x] 设置 AI 页在 flag 开时渲染 allowlist；flag 关不出现该区块

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Schema / DB | `src/db/types.ts` `schemas.ts` `engine.ts` v51 | 新增表 `external_mcp_trust` |
| Service | `src/ai/mcp/client/externalMcpTrustRegistry.ts` | 新增 |
| Flag | `src/ai/config/featureFlags.ts` | 新增 |
| UI | `SettingsAiMcpTrustSection.tsx` + Settings AI tab | 新增 / 装配 |
| i18n | `settingsModalMessages` + 中英 catalog | 新键 |
| 测试 | registry + engine + settings section vitest | 新增 |

## 5. 已知风险与依赖

- 依赖 A9 `inspectInbound`；flag 关时不得改变现网。
- 不把 `serverName` 当安全边界（Claude Code 文档）。
- 回滚：关 flag；表可留空。
