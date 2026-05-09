import { globalContext } from './GlobalContextService';
import {
  buildVoiceAgentGroundingContext,
  type GroundingContextData,
  type VoiceAgentGroundingUiContext,
} from './VoiceAgentGroundingContext';
import type { VoiceSession } from './IntentRouter';
import type { Locale } from '../i18n';

export type VoiceAgentGroundingUiState = {
  currentSegmentId: string | null;
  selectedSegmentIds: string[];
  currentPhase: string;
  attentionHotspots: Array<{ segmentId: string; index: number; score: number }>;
};

export function applyVoiceAgentGroundingUiContext(
  current: VoiceAgentGroundingUiState,
  context: Partial<VoiceAgentGroundingUiContext>,
): VoiceAgentGroundingUiState {
  return {
    currentSegmentId:
      context.currentSegmentId !== undefined
        ? (context.currentSegmentId ?? null)
        : current.currentSegmentId,
    selectedSegmentIds:
      context.selectedSegmentIds !== undefined
        ? context.selectedSegmentIds
        : current.selectedSegmentIds,
    currentPhase: context.currentPhase !== undefined ? context.currentPhase : current.currentPhase,
    attentionHotspots:
      context.attentionHotspots !== undefined
        ? context.attentionHotspots
        : current.attentionHotspots,
  };
}

export function buildVoiceAgentServiceGroundingContext(input: {
  session: VoiceSession;
  locale: Locale;
  uiState: VoiceAgentGroundingUiState;
}): GroundingContextData {
  return buildVoiceAgentGroundingContext({
    corpus: globalContext.getCorpusContext(),
    profile: globalContext.getBehaviorProfile(),
    session: input.session,
    locale: input.locale,
    uiContext: {
      currentSegmentId: input.uiState.currentSegmentId,
      selectedSegmentIds: input.uiState.selectedSegmentIds,
      currentPhase: input.uiState.currentPhase,
      attentionHotspots: input.uiState.attentionHotspots,
    },
  });
}
