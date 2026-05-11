import { hookRule } from './rule-builders.mjs';

/**
 * Named `src/hooks` entries (`hookRule`). Extracted from `architecture-guard.config.mjs` (Phase 0.4).
 */
export const architectureGuardNamedHookRules = [
  hookRule('useVoiceAgent', {
    maxLines: 930,
    maxUseCallbackDecls: 27,
    maxUseMemoDecls: 0,
    maxUseEffects: 5,
  }),
  hookRule('useVoiceInteraction', {
    maxLines: 560,
    maxUseCallbackDecls: 12,
    maxUseMemoDecls: 7,
    maxUseEffects: 9,
    requiredRegexes: [
      /createTranscriptionVoiceSendToAiChat\(\{/,
      /computeTranscriptionVoiceTargetSummary\(\{/,
      /computeTranscriptionVoiceSelectionSummary\(\{/,
    ],
  }),
  hookRule('useAiChat', {
    maxLines: 1100,
    maxUseCallbackDecls: 16,
    maxUseMemoDecls: 3,
    maxUseEffects: 4,
    requiredRegexes: [
      /export function useAiChat\(options\?: UseAiChatOptions\)/,
      /import \{ createAssistantStream \} from '\.\/ai\/useAiChat\.streamFactory';/,
      /import \{ enrichContextWithRag \} from '\.\/ai\/useAiChat\.rag';/,
      /import \{ resolveToolDecisionPipeline \} from '\.\/ai\/useAiChat\.toolDecisionPipeline';/,
      /import \{ executeConfirmedToolCall \} from '\.\/ai\/useAiChat\.confirmExecution';/,
    ],
  }),
  hookRule('useTimelineUnitViewIndex', {
    maxLines: 70,
    maxUseCallbackDecls: 0,
    maxUseMemoDecls: 1,
    maxUseEffects: 0,
  }),
  hookRule('useSegmentRangeGesturePreviewWriter', {
    maxLines: 90,
    maxUseCallbackDecls: 0,
    maxUseMemoDecls: 2,
    maxUseEffects: 0,
  }),
  hookRule('useTranscriptionData', {
    maxLines: 600,
    maxUseCallbackDecls: 0,
    maxUseMemoDecls: 0,
    maxUseEffects: 1,
  }),
];
