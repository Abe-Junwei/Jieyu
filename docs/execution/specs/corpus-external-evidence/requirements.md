---
title: corpus-external-evidence requirements
doc_type: execution-spec-requirements
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: corpus-external-evidence-spec
---

# Requirements — corpus-external-evidence

## 1. What & Why

- **要做什么**：外部证据源经 MCP 接入（文献、网页、语料资源）；命中写成带页码或网址的证据包；主张核对走 B16b。
- **为什么现在做**：B16b 已落地。用户要求继续做 B17（#316）。
- **不做什么**：不调会把摘录送去第二个模型的回答工具。不在浏览器里 spawn stdio。不改 CSP。

## 2. 用户场景

1. 文献命中带作品、页码和原文段落时，主张可以引用该命中 id，正文写出出处。
2. 网页命中带网址、标题和段落时同样可引用。
3. flag 关闭时不拉起本机进程、不发文献或网页检索请求。

## 3. 验收标准

- [x] 无出处或无原文段落的命中不进证据包
- [x] `answer_with_citations` 类工具被拒绝
- [x] flag 关时 stdio 不调 host；浏览器无 host 时返回 `not_desktop`
- [x] 主张引用证据包 id 时，正文由核对渲染填回出处

## 4. 受影响代码地图

- `src/ai/vertical/evidencePacket.ts`
- `src/ai/mcp/client/externalMcpEvidenceHits.ts`
- `src/ai/mcp/client/externalMcpStdioClient.ts`
- `src/ai/vertical/corpusAnalysisReport.ts`
