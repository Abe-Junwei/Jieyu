import { describe, expect, it } from 'vitest';
import { getActionLabel, type VoiceSession } from './IntentRouter';
import type { CorpusContext, UserBehaviorProfile } from './GlobalContextService';
import { buildVoiceAgentGroundingContext } from './VoiceAgentGroundingContext';
import { DEFAULT_VOICE_MODE } from './voiceMode';

function makeProfile(): UserBehaviorProfile {
  return {
    actionFrequencies: { playPause: 4, undo: 2 },
    actionDurations: {},
    fatigue: {
      score: 0.42,
      speakingRateTrend: 'stable',
      pauseFrequencyTrend: 'stable',
      lastBreakAt: Date.now(),
    },
    preferences: {
      preferredMode: 'analysis',
      safeModeDefault: false,
      wakeWordEnabled: false,
      preferredEngine: 'web-speech',
      preferredLang: null,
      confirmationThreshold: 'destructive',
    },
    taskDurations: {},
    usageTimeDistribution: new Array(24).fill(0),
    totalSessions: 3,
    lastSessionAt: Date.now(),
  };
}

function makeCorpus(): CorpusContext {
  return {
    segments: [
      {
        id: 'seg-1',
        text: 'alpha beta gamma',
        translation: 'first',
        glossTiers: { main: 'A / B / C' },
        audioTimeRange: [0, 2],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'seg-2',
        text: 'alpha delta epsilon',
        translation: null,
        glossTiers: null,
        audioTimeRange: [2, 4],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    documents: [],
    corpusLang: 'cmn',
    primaryLanguageName: '中文',
    projectMeta: {
      name: 'demo',
      createdAt: 1,
      lastEditedAt: 1,
      totalDuration: 4,
    },
  };
}

function makeSession(): VoiceSession {
  return {
    id: 'session-1',
    startedAt: Date.now(),
    mode: DEFAULT_VOICE_MODE,
    entries: [
      {
        timestamp: Date.now(),
        sttText: '解释一下',
        confidence: 0.9,
        intent: { type: 'chat', text: '解释一下', raw: '解释一下' },
      },
      {
        timestamp: Date.now(),
        sttText: '播放',
        confidence: 0.91,
        intent: { type: 'action', actionId: 'playPause', raw: '播放', confidence: 0.91 },
      },
    ],
  };
}

describe('buildVoiceAgentGroundingContext', () => {
  it('builds current segment, profile summary and ai adoption rate from service inputs', () => {
    const context = buildVoiceAgentGroundingContext({
      corpus: makeCorpus(),
      profile: makeProfile(),
      session: makeSession(),
      locale: 'zh-CN',
      uiContext: {
        currentSegmentId: 'seg-1',
        selectedSegmentIds: ['seg-1'],
        currentPhase: 'transcribing',
        attentionHotspots: [{ segmentId: 'seg-1', index: 1, score: 0.8 }],
      },
    });

    expect(context.currentSegment?.id).toBe('seg-1');
    expect(context.currentSegment?.gloss).toBe('A / B / C');
    expect(context.userProfile.preferredMode).toBe('analysis');
    expect(context.userProfile.mostUsedAction).toBe(getActionLabel('playPause'));
    expect(context.userProfile.confirmationPreference).toBe('destructive-only');
    expect(context.aiAdoptionRate).toBe(0.5);
    expect(context.relevantCorpus).toHaveLength(1);
  });
});
