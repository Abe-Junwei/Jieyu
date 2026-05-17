---
title: segment_qa 垂直链台账（PR-7b）
doc_type: execution-audit
status: active
last_updated: 2026-05-15
---

# segment_qa 垂直链台账（PR-7b）

SoT 对账表：PR-7b 子项 ↔ 代码锚点 ↔ **L0（PR）/ L1（发版·按需）** 验证。与 [AI与代码库可治理性综合整改方案-2026-05-13.md](../plans/AI与代码库可治理性综合整改方案-2026-05-13.md) Phase **F0** 联动；**L1 脚本不是 PR merge blocker**（见 [单人AI协作改进计划-拍板决策-2026-05-11.md](../plans/单人AI协作改进计划-拍板决策-2026-05-11.md) §四）。

| PR-7b 子项 | 状态 | 代码锚点 | L0 / L1 验证 | 最近验证 PR |
| --- | --- | --- | --- | --- |
| `CorpusSourceSet` / `corpus_source_set` scope | completed（M6） | `src/ai/vertical/verticalWorkflowRegistry.ts`；`src/ai/vertical/sourceResolver.ts` | **L0**：`npm run typecheck` + 相关 `vitest` + `npm run check:agent-evals:smoke`。**L1**：按需 `check:agent-evals:trace` / `gate:release-evidence:*` | — |
| RAG `candidateSourceIds` 收窄 | completed（M6） | `src/hooks/ai/useAiChat.rag.ts`；`src/ai/embeddings/EmbeddingSearchService.ts` | 同上 | — |
| evidence 卡片分组 UI（来源 / quote / confidence / jump） | completed（M6） | `src/components/ai/AiChatAssistantMessage.tsx`（`ai-chat-evidence-*`） | **L0** + 触及 UI 时 `npm run test:e2e:chromium`（若改交互）。**L1**：`check:citation-accuracy` | — |
| degraded fallback 完整 UX | completed（M6） | `src/components/ai/AiChatDegradationOverride.tsx`；`AiChatAssistantMessage.tsx` | **L0** 同上。**L1**：按需 trace / release evidence | — |
| prompt / reflection citation 校验 | completed（M6） | `src/ai/vertical/segmentQaReflection.ts`；`src/hooks/ai/useAiChat.sendTurnStreamPhase*.ts` | **L0**：定向 `useAiChat.sendTurnStreamPhase*.test` + `check:agent-evals:smoke`。**L1**：`check:agent-evals:cases`（语义全量，按需） | — |

**维护**：触及 F0 触发路径的 PR 应更新 `last_updated` 或附 PR 内审阅日期（≤14 天）。
