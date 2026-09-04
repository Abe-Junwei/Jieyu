---
title: agent-runtime-external-mcp-trust design
doc_type: execution-spec-design
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-external-mcp-trust-spec
depends_on:
  - ./requirements.md
  - ../../../architecture/ai-agent-runtime-security-local-first.md
---

# Design — External MCP Trust (B11)

## 1. 成熟方案扫描 / Research

- 仓库既有：inbound `McpServer` Bearer + 只读 hard-fail；`mcp_tool_call_audits`；`MCP_CLIENT_REGISTRY` 空占位；A9 `inspectInbound`；设置 AI tab 已有 provider persist 模式。
- 同类产品：Claude Code `allowedMcpServers` 按 **serverUrl / command** 而非 display name；Trail of Bits `mcp-context-protector` 对 tools/list 做 TOFU + 描述变更拦截；mcp-doorman / Veil 在 `tools/list` 扫描 tool description 注入。
- 业内规范：MCP `tools/list` 是模型可见攻击面（tool poisoning）；OWASP LLM01 间接注入；默认 deny allowlist。
- 公认不可行：接企业 MCP gateway SaaS；用 serverName 当 allowlist；把 schema 先拼进 prompt 再扫描；本切片实现完整 outbound client。
- 潜在的坑：pathname 不同即不同 server；flag 关必须零暴露；Dexie 升 v51 须同步 a2a 守卫与 session-memory 版本断言。
- 决定：**适配** Claude Code origin allowlist + protector 的 list 扫描；**复用** A9 inspect 与 Dexie audit；**自研** 浏览器内 registry（不引入代理依赖）。

## 2. 架构选择

- 落位：`actions`（enable/disable + audit）+ `derived`（normalize origin / expose filter）
- 方案 A：Dexie `external_mcp_trust` + `exposeExternalMcpToolsToLlm` 纯门面 — **选 A**，未来 client 只调这一入口
- 拒绝：localStorage-only（无 write→reload 合同）；新 Settings 顶栏 tab（AI tab 一节即可）

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `externalMcpTrustRegistry.ts` | origin 规范化、CRUD、expose 门、A9 扫描、audit | < 250 |
| `engine.ts` v51 + types/schemas | 表与校验 | 迁移块 |
| `SettingsAiMcpTrustSection.tsx` | flag 开时的 allowlist UI | < 180 / < 8 hooks |
| `featureFlags.ts` | `aiExternalMcpTrustEnabled` 默认 false | 数行 |

约束自查：编排层不写规则；不引入 `src/features/`；无第三层 panel border。

## 4. ADR 引用

- 相关：`docs/adr/adr-ai-grounding-mcp-shaped.md`、ADR-0031 CSP connect-src
- 新建 ADR：否（allowlist 可演进，非硬逆转协议）

## 5. Feature flag

- Flag：`aiExternalMcpTrustEnabled` / `VITE_AI_EXTERNAL_MCP_TRUST_ENABLED`
- 默认：`false`（全部环境）
- 放量：合并后自用 1 周再考虑默认 true

## 6. 失败模式 / 兼容性

- 旧用户：无行 = deny；flag 关 = 零暴露
- 迁移：v51 空表
- 回滚：关 flag

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/ai/mcp/client src/db/engine.externalMcpTrust.test.ts src/ai/config/featureFlags.environmentMatrix.test.ts` | pass |
| 结构守卫 | `npm run check:architecture-guard` + `check:docs-governance` + `check:plans-frontmatter` | OK |
| Agent evals | `npm run check:agent-evals:smoke` | OK |
