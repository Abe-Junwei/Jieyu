---
title: corpus-external-evidence design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: corpus-external-evidence-spec
depends_on:
  - ./requirements.md
---

# Design — corpus-external-evidence

## 1. 成熟方案扫描 / Research

- 仓库既有最相似的模式：B11–B15 的信任名单、HTTP MCP、send-turn 桥、证据包映射；B16b 的主张核对。
- 同类产品：Consensus 无证据不出句；PaperQA2 先检索再引用段落；Deepvault 的 `search_literature` 只返回带出处的摘录，不调用会再过一遍模型的回答工具。
- 业内做法：网页检索走独立搜索服务，不用模型供应商自带联网。本机文献进程由桌面宿主以 stdio 拉起。
- 不可行：在浏览器渲染进程里 spawn。会改 CSP，也绕过信任名单。
- 坑：把第二个模型的回答工具当检索结果，会把摘录送出本机。
- 决定：复用 B11–B15。新增文献/网页命中映射和 stdio 宿主桥。flag 默认关。主张核对复用 B16b。

## 2. 架构选择

- 落位：纯函数映射 + 宿主桥 + 现有 turn bridge 路由。
- 桌面宿主通过 `window.__JIEYU_EXTERNAL_MCP_STDIO__` 注入。本检出无 Electron 主进程实现时，浏览器路径稳定返回 `not_desktop`。
- `stdio://server-id` 进 B11 信任名单后才能调用。

## 3. 验证

- `npx vitest run src/ai/mcp/client/externalMcpEvidenceHits.test.ts src/ai/mcp/client/externalMcpStdioClient.test.ts src/ai/vertical/corpusAnalysisReport.test.ts`
- `npm run typecheck`
- `npm run check:docs-governance`
