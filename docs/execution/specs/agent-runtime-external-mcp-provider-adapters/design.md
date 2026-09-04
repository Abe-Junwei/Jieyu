---
title: agent-runtime-external-mcp-provider-adapters design
doc_type: execution-spec-design
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-external-mcp-provider-adapters-spec
depends_on:
  - ./requirements.md
  - ../../../architecture/ai-agent-runtime-security-local-first.md
  - ../../specs/agent-runtime-external-mcp-send-turn/design.md
  - ../../../adr/0031-ai-chat-keyvault-and-csp-connect-src.md
---

# Design — External MCP Provider Adapters (B15)

## 1. 成熟方案扫描 / Research

- 仓库既有：B13 Streamable HTTP；B14 `extmcp__` send-turn；空 `MCP_CLIENT_REGISTRY`；`EvidencePacketV0` 已有 `document`。
- 同类产品：Zotero MCP（kujenga / richardjlyon）默认 **stdio**；浏览器可达的是 Streamable HTTP，常见环回 `http://127.0.0.1:8765/mcp`（再转 Zotero local API `:23119`）。OpenAlex MCP（gpetruzella / Mearman / cyanheads）工具名 `search_works` / `get_work` / `openalex_*`；HTTP 多为自托管，无单一官方公网 URL。
- 业内规范：浏览器 **不能** spawn stdio；CSP 按 ADR-0031 **枚举** host，禁止 `https:` 通配。
- 公认不可行：在页面里跑 Python MCP；直连 `api.openalex.org`（绕过 MCP + 需新 CSP）；把外部名塞进 `AI_TOOL_CATALOG`。
- 潜在的坑：各实现工具名不统一，用前缀+集合指纹；公网 OpenAlex MCP 仍被 CSP 拦（刻意，部署层加 host）。
- 决定：**适配** HTTP MCP 结果 → EvidencePacket；**复用** B13/B14；**不**自研 REST 客户端。CSP 只加与 3040 同类的 Zotero HTTP 环回 8765。

## 2. 架构选择

- 落位：`derived`（指纹 + JSON→packet）+ 编排层数行 + Settings 填草稿
- 方案 A：纯函数适配器，execute 后附带 packets — **选 A**
- 拒绝：stdio child_process；OAuth；ChatWindow

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `externalMcpProviderAdapters.ts` | 预置 origin、指纹、映射 | < 180 |
| `externalMcpTurnBridge.ts` | flag 开时附 `evidencePackets` | ~15 行 |
| `SettingsAiMcpTrustSection.tsx` | 预置填草稿 | ~20 行 |
| `featureFlags.ts` / `index.html` | flag + CSP 8765 | 数行 |

约束自查：无 ChatWindow；无第 3 层 border；不引入 `src/features/`。

## 4. ADR 引用

- ADR-0031：枚举 8765，不恢复通配
- 新建 ADR：否

## 5. Feature flag

- `aiExternalMcpProviderAdaptersEnabled` / `VITE_AI_EXTERNAL_MCP_PROVIDER_ADAPTERS_ENABLED`
- 默认 `false`（全部环境）

## 6. 失败模式 / 兼容性

- flag 关：B14 JSON 结果不变
- 映射失败：packets `[]`，仍返回原始 content
- 回滚：关 flag

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/ai/mcp/client src/ai/config/featureFlags.environmentMatrix.test.ts src/components/settings/SettingsAiMcpTrustSection.test.tsx` | pass |
| 守卫 | architecture-guard / docs / evals smoke | OK |
