import { describe, expect, it } from 'vitest';
import { AiHybridRecommendationService, type AiHybridRecommendationInput } from './AiHybridRecommendationService';

function buildInput(overrides: Partial<AiHybridRecommendationInput> = {}): AiHybridRecommendationInput {
  return {
    locale: 'en-US',
    enabled: true,
    composerIdle: true,
    aiChatSettings: {
      providerKind: 'deepseek',
      model: 'deepseek-chat',
    } as never,
    connectionTestStatus: 'success',
    primarySuggestion: 'Try asking: review the current translation',
    page: 'transcription',
    observerStage: 'reviewing',
    aiCurrentTask: 'translation',
    rowNumber: 3,
    selectedLayerType: 'translation',
    selectedText: 'Current draft translation',
    ...overrides,
  };
}

function buildEvent(
  type: 'shown' | 'accepted_exact' | 'accepted_edited',
  source: 'fallback' | 'llm',
  prompt: string,
  timestamp: string,
) {
  return {
    type,
    source,
    prompt,
    signature: `${source}:${prompt}`,
    timestamp,
  };
}

describe('AiHybridRecommendationService', () => {
  it('makes significant context change rules configurable', () => {
    const service = new AiHybridRecommendationService({
      significance: {
        trackedReasons: {
          rowBucket: false,
        },
      },
    });

    const left = service.buildRefinementSignature(buildInput({ rowNumber: 1 }));
    const right = service.buildRefinementSignature(buildInput({ rowNumber: 8 }));

    expect(left).toBe(right);
  });

  it('downranks fallback prompts that were repeatedly shown and ignored', () => {
    const now = Date.parse('2026-04-03T12:00:00.000Z');
    const service = new AiHybridRecommendationService(undefined, {
      now: () => now,
    });
    const telemetry = {
      lastShownPrompt: 'Review the current translation',
      recentEvents: [
        buildEvent('shown', 'fallback', 'Review the current translation', '2026-04-03T11:57:00.000Z'),
        buildEvent('shown', 'fallback', 'Review the current translation', '2026-04-03T11:58:00.000Z'),
        buildEvent('shown', 'fallback', 'Review the current translation', '2026-04-03T11:59:00.000Z'),
      ],
    };

    const items = service.buildRecommendationItems([
      'Review the current translation',
      'Explain what should be fixed first',
      'Summarize the main issues in this draft',
    ], 'fallback', telemetry);

    expect(items[0]?.prompt).toBe('Explain what should be fixed first');
  });

  it('suppresses remote refinement during repeated ignored llm suggestions', () => {
    const now = Date.parse('2026-04-03T12:00:00.000Z');
    const service = new AiHybridRecommendationService(undefined, {
      now: () => now,
    });

    const shouldUseRemote = service.shouldUseRemoteRefinement(buildInput({
      recommendationTelemetry: {
        recentEvents: [
          buildEvent('shown', 'llm', 'Review row 3', '2026-04-03T11:57:00.000Z'),
          buildEvent('shown', 'llm', 'Review row 4', '2026-04-03T11:58:00.000Z'),
          buildEvent('shown', 'llm', 'Review row 5', '2026-04-03T11:59:00.000Z'),
        ],
      },
    }));

    expect(shouldUseRemote).toBe(false);
  });

  it('reuses cache entries until ttl expires and enforces remote budget', () => {
    let now = Date.parse('2026-04-03T12:00:00.000Z');
    const service = new AiHybridRecommendationService({
      cacheTtlMs: 500,
      remoteBudgetWindowMs: 1_000,
      maxRemoteRequestsPerWindow: 2,
    }, {
      now: () => now,
    });

    service.setCachedRecommendations('sig', [{
      id: 'fallback-0-x',
      label: 'Explain the current issue',
      prompt: 'Explain the current issue',
      source: 'fallback',
    }]);

    expect(service.getCachedRecommendations('sig')?.[0]?.prompt).toBe('Explain the current issue');

    expect(service.consumeRemoteBudget()).toBe(true);
    expect(service.consumeRemoteBudget()).toBe(true);
    expect(service.consumeRemoteBudget()).toBe(false);

    now += 600;
    expect(service.getCachedRecommendations('sig')).toBeNull();

    now += 500;
    expect(service.consumeRemoteBudget()).toBe(true);
  });
});
