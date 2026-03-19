#!/usr/bin/env bash
set -euo pipefail

# 执行前确认：当前分支包含本次改动。
# 本脚本只做 add/commit，不做 reset、不做 checkout。

# 1) 融合参数治理（本轮新增）
git add src/ai/embeddings/searchFusionProfiles.ts
git add src/ai/embeddings/searchFusionProfiles.test.ts
git add src/ai/embeddings/EmbeddingSearchService.ts
git commit -m "feat(embedding): add scenario resolver and stronger fusion weight validation"

# 2) 语音智能体主线
git add src/hooks/useVoiceAgent.ts src/hooks/useVoiceAgent.test.tsx
git add src/services/VoiceInputService.ts
git add src/services/IntentRouter.ts src/services/IntentRouter.test.ts
git add src/components/VoiceAgentWidget.tsx
git add src/services/EarconService.ts

git add src/services/VoiceIntentLlmResolver.ts src/services/VoiceIntentLlmResolver.test.ts
git add src/ai/config/voiceIntentResolver.ts
git add src/services/stt/
git add src/utils/langMapping.ts
# 可选：语音入口联动文件
# git add src/pages/TranscriptionPage.tsx src/services/KeybindingService.ts src/hooks/useKeybindingActions.ts src/styles.css
# git commit -m "feat(voice): add voice agent pipeline, router, widgets and pluggable STT providers"

# 3) RAG / PDF / Embedding 链路
# git add src/ai/embeddings/
# git add src/components/PdfViewerPanel.tsx
# git add src/utils/citationJumpUtils.ts src/utils/citationJumpUtils.test.ts
# git commit -m "feat(rag): enhance embedding retrieval, pdf extraction and citation jump flow"

# 4) 任务调度与自动标注
# git add src/ai/tasks/ src/ai/AutoGlossService.ts src/ai/AutoGlossService.test.ts
# git commit -m "feat(ai-task): introduce task runner and integrate auto gloss pipeline"

# 5) AI 面板与编排增强
# git add src/hooks/useAiChat.ts src/hooks/useAiChat.test.tsx
# git add src/hooks/useAiPanelLogic.ts src/hooks/useAiPanelLogic.test.tsx
# git add src/hooks/useAiToolCallHandler.ts src/hooks/useAiToolCallHandler.test.tsx
# git add src/components/AiAnalysisPanel.tsx src/components/AiAnalysisPanel.test.tsx
# git add src/contexts/AiPanelContext.tsx src/ai/ChatOrchestrator.ts src/ai/ProjectObserver.ts
# git commit -m "feat(ai-panel): improve ai chat orchestration, panel logic and tool-call handling"

# 6) 基础与文档
# git add db.ts package.json package-lock.json
# git add docs/execution/
# git add 参考/
# git commit -m "docs(chore): update schema/deps and add execution reports"

echo "Done: first commit executed, remaining commit groups are prepared as uncomment-and-run blocks."
