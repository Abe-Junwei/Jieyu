import type { CorpusContext, UserBehaviorProfile } from './GlobalContextService';
import { getActionLabel, type ActionId, type VoiceSession } from './IntentRouter';

export interface GroundingContextData {
  currentSegment: {
    id: string;
    index: number;
    text: string;
    translation: string | null;
    gloss: string | null;
    isMarked: boolean;
    durationSeconds: number;
  } | null;
  selectedSegmentIds: string[];
  totalSegments: number;
  userProfile: {
    preferredMode: string;
    mostUsedAction: string | null;
    fatigueScore: number;
    confirmationPreference: 'always' | 'destructive-only' | 'never';
  };
  currentPhase: string;
  attentionHotspots: Array<{ segmentId: string; index: number; score: number }>;
  relevantCorpus: Array<{
    segmentId: string;
    text: string;
    translation: string | null;
    score: number;
    source: 'transcription' | 'translation' | 'gloss' | 'document';
  }>;
  aiAdoptionRate: number | null;
  contextBuiltAt: number;
}

export interface VoiceAgentGroundingUiContext {
  currentSegmentId: string | null;
  selectedSegmentIds: string[];
  currentPhase: string;
  attentionHotspots: Array<{ segmentId: string; index: number; score: number }>;
}

export interface BuildVoiceAgentGroundingContextInput {
  corpus: CorpusContext | null;
  profile: UserBehaviorProfile;
  session: VoiceSession;
  uiContext: VoiceAgentGroundingUiContext;
}

export function buildVoiceAgentGroundingContext({
  corpus,
  profile,
  session,
  uiContext,
}: BuildVoiceAgentGroundingContextInput): GroundingContextData {
  let currentSegment: GroundingContextData['currentSegment'] = null;
  if (uiContext.currentSegmentId && corpus) {
    const seg = corpus.segments.find((item) => item.id === uiContext.currentSegmentId);
    if (seg) {
      const segIndex = corpus.segments.indexOf(seg) + 1;
      const duration = seg.audioTimeRange ? seg.audioTimeRange[1] - seg.audioTimeRange[0] : 0;
      currentSegment = {
        id: seg.id,
        index: segIndex,
        text: seg.text,
        translation: seg.translation,
        gloss: seg.glossTiers ? Object.values(seg.glossTiers).join(' / ') : null,
        isMarked: false,
        durationSeconds: duration,
      };
    }
  }

  let mostUsedAction: string | null = null;
  const actionEntries = Object.entries(profile.actionFrequencies ?? {});
  if (actionEntries.length > 0) {
    actionEntries.sort((left, right) => right[1] - left[1]);
    const topEntry = actionEntries[0];
    if (topEntry) {
      mostUsedAction = getActionLabel(topEntry[0] as ActionId);
    }
  }

  const rawThreshold = profile.preferences?.confirmationThreshold;
  const confirmationPreference: GroundingContextData['userProfile']['confirmationPreference'] =
    rawThreshold === 'always'
      ? 'always'
      : rawThreshold === 'never'
        ? 'never'
        : 'destructive-only';

  const userProfile: GroundingContextData['userProfile'] = {
    preferredMode: profile.preferences?.preferredMode ?? 'command',
    mostUsedAction,
    fatigueScore: profile.fatigue?.score ?? 0,
    confirmationPreference,
  };

  let relevantCorpus: GroundingContextData['relevantCorpus'] = [];
  if (currentSegment && corpus) {
    const keywords = currentSegment.text.split(/\s+/).filter((word) => word.length > 2);
    relevantCorpus = corpus.segments
      .filter((segment) => segment.id !== currentSegment.id && keywords.some((keyword) => segment.text.includes(keyword)))
      .slice(0, 5)
      .map((segment) => ({
        segmentId: segment.id,
        text: segment.text,
        translation: segment.translation,
        score: keywords.filter((keyword) => segment.text.includes(keyword)).length / keywords.length,
        source: segment.translation ? 'translation' : 'transcription',
      }));
  }

  let aiAdoptionRate: number | null = null;
  const recentEntries = session.entries.slice(-20);
  const aiActions = recentEntries.filter((entry) => entry.intent.type === 'chat' || entry.intent.type === 'tool');
  if (aiActions.length > 0) {
    aiAdoptionRate = aiActions.length / Math.max(recentEntries.length, 1);
  }

  return {
    currentSegment,
    selectedSegmentIds: uiContext.selectedSegmentIds,
    totalSegments: corpus?.segments.length ?? 0,
    userProfile,
    currentPhase: uiContext.currentPhase,
    attentionHotspots: uiContext.attentionHotspots,
    relevantCorpus,
    aiAdoptionRate,
    contextBuiltAt: Date.now(),
  };
}