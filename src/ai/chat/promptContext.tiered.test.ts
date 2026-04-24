import { describe, expect, it } from 'vitest';
import { buildAiSystemPrompt, buildPromptContextBlock } from './promptContext';
import type { AiPromptContext } from './chatDomain.types';

describe('buildPromptContextBlock tiered assembly (Phase 14)', () => {
  it('prefers tier-2 longTerm lines before tier-3 acousticSummary', () => {
    const context: AiPromptContext = {
      shortTerm: {
        page: 'transcription',
        projectUnitCount: 3,
        currentMediaUnitCount: 3,
        worldModelSnapshot: 'project\n  media a\n    unit x',
      },
      longTerm: {
        projectStats: { unitCount: 3, translationLayerCount: 0, aiConfidenceAvg: null },
        waveformAnalysis: {
          lowConfidenceCount: 0,
          overlapCount: 0,
          gapCount: 2,
          maxGapSeconds: 0.5,
        },
        acousticSummary: {
          selectionStartSec: 0,
          selectionEndSec: 1,
          f0MeanHz: 200,
          voicedFrameCount: 1,
          frameCount: 2,
        },
      },
    };

    const block = buildPromptContextBlock(context, 520);
    expect(block).toContain('waveformAnalysis(');
    expect(block).toContain('projectStats(');
    expect(block).not.toContain('acousticSummary(');
  });

  it('includes acousticSummary when the budget allows', () => {
    const context: AiPromptContext = {
      shortTerm: {
        page: 'transcription',
        projectUnitCount: 1,
        currentMediaUnitCount: 1,
        worldModelSnapshot: 'x',
      },
      longTerm: {
        projectStats: { unitCount: 1, translationLayerCount: 0, aiConfidenceAvg: null },
        acousticSummary: {
          selectionStartSec: 0,
          selectionEndSec: 1,
          f0MeanHz: 100,
          voicedFrameCount: 1,
          frameCount: 1,
        },
      },
    };

    const block = buildPromptContextBlock(context, 4000);
    expect(block).toContain('acousticSummary(');
  });

  it('adds active-tool subset guidance into the system prompt', () => {
    const prompt = buildAiSystemPrompt('transcription', '', 'detailed', ['get_project_stats', 'diagnose_quality']);
    expect(prompt).toContain('prefer these local reads inside tool_call JSON only');
    expect(prompt).toContain('get_project_stats');
    expect(prompt).toContain('diagnose_quality');
  });
});
