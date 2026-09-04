---
title: agent-runtime-external-mcp-provider-adapters requirements
doc_type: execution-spec-requirements
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-external-mcp-provider-adapters-spec
---

# Requirements — External MCP Provider Adapters (B15)

## 1. What & Why

- **要做什么**：为 Zotero / OpenAlex 提供 HTTP MCP 预置（`EXTERNAL_MCP_PROVIDER_PRESETS`；`MCP_CLIENT_REGISTRY` 保持 PR-20 空占位以免循环依赖）：已知工具指纹、把 `tools/call` 文本结果映射为 `EvidencePacketV0`（`document`）；Settings 可一键填 origin 草稿。本机 Zotero Streamable HTTP 默认环回写入 CSP 枚举。
- **为什么现在做**：B13/B14 已能 list/call 任意 HTTP MCP，但结果仍是生 JSON；路线图下一刀是专用适配。浏览器不能跑 stdio。
- **不做什么**：不 spawn stdio；不接 OAuth；不直连 `api.openalex.org`；不把工具写入 `AI_TOOL_CATALOG`；不改 ChatWindow；不做 B5b；不恢复 `connect-src` `https:` 通配。

## 2. 用户场景（≤ 3 条）

1. Flag 关：execute 结果不含 `evidencePackets`；Settings 无预置按钮。
2. Flag 开：`search_works` / `zotero_search_items` 等命中指纹时，结果带 `document` EvidencePacket。
3. Settings：点 Zotero 预置填入 `http://127.0.0.1:8765/mcp`；仍须用户「添加并启用」。

## 3. 验收标准（可测）

- [ ] `aiExternalMcpProviderAdaptersEnabled` 默认 `false`
- [ ] 已知 OpenAlex/Zotero JSON → `buildEvidencePacketV0`；垃圾输入 → `[]`
- [ ] flag 关零 packets
- [ ] 预置只填草稿，不写 Dexie、不 fetch
- [ ] CSP 仅增 loopback `8765`，无 `https:` 通配

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| Service | `externalMcpProviderAdapters.ts` | 新增 |
| Bridge | `externalMcpTurnBridge.ts` | 成功 call 后映射 |
| UI | `SettingsAiMcpTrustSection.tsx` | 预置按钮 |
| CSP | `index.html` | 枚举 8765 |
| Flag | `featureFlags.ts` | 新增 |

## 5. 已知风险与依赖

- 依赖 B11–B14；远端 OpenAlex HTTP 仍需部署层 CSP。
- 回滚：关 flag；CSP 8765 可保留（与现有 3040 同类环回）。
