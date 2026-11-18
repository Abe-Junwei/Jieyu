import { describe, expect, it } from 'vitest';
import {
  buildWaveformAnalysisOverlaySummary,
  buildWaveformAnalysisPromptSummary,
  buildRiskHotZones,
} from './waveformAnalysisOverlays';

describe('waveformAnalysisOverlays', () => {
  it('derives low-confidence, overlap, and gap bands from units', () => {
    const summary = buildWaveformAnalysisOverlaySummary([
      { id: 'u2', startTime: 1.2, endTime: 2.4, ai_metadata: { confidence: 0.61 } },
      { id: 'u1', startTime: 0, endTime: 1.5, ai_metadata: { confidence: 0.93 } },
      { id: 'u3', startTime: 3.5, endTime: 4.0 },
    ]);

    expect(summary.lowConfidenceBands).toEqual([
      { id: 'u2', startTime: 1.2, endTime: 2.4, confidence: 0.61 },
    ]);
    expect(summary.overlapBands).toEqual([
      { id: 'overlap:1', startTime: 1.2, endTime: 1.5, concurrentCount: 2 },
    ]);
    expect(summary.gapBands).toEqual([
      { id: 'gap:u2:u3', startTime: 2.4, endTime: 3.5, gapSeconds: 1.1 },
    ]);
  });

  it('merges adjacent overlap slices with the same concurrent count', () => {
    const summary = buildWaveformAnalysisOverlaySummary([
      { id: 'u1', startTime: 0, endTime: 4 },
      { id: 'u2', startTime: 1, endTime: 2 },
      { id: 'u3', startTime: 2, endTime: 3 },
    ]);

    expect(summary.overlapBands).toEqual([
      { id: 'overlap:1', startTime: 1, endTime: 3, concurrentCount: 2 },
    ]);
  });

  it('builds compact prompt summary for AI context', () => {
    const summary = buildWaveformAnalysisPromptSummary(
      [
        { id: 'u1', startTime: 0, endTime: 1.5, ai_metadata: { confidence: 0.91 } },
        { id: 'u2', startTime: 1.2, endTime: 2.4, ai_metadata: { confidence: 0.61 } },
        { id: 'u3', startTime: 3.5, endTime: 4.9 },
      ],
      {
        selectionStartTime: 1,
        selectionEndTime: 2.5,
        audioTimeSec: 1.3,
      },
    );

    expect(summary.lowConfidenceCount).toBe(1);
    expect(summary.overlapCount).toBe(1);
    expect(summary.gapCount).toBe(1);
    expect(summary.maxGapSeconds).toBeCloseTo(1.1, 5);
    expect(summary.selectionLowConfidenceCount).toBe(1);
    expect(summary.selectionOverlapCount).toBe(1);
    expect(summary.selectionGapCount).toBe(1);
    expect(summary.activeSignals).toEqual(['low_confidence:61%@1.2-2.4', 'overlap:x2@1.2-1.5']);
  });

  it('ignores skip-processing units in analysis summaries', () => {
    const summary = buildWaveformAnalysisPromptSummary([
      {
        id: 'u1',
        startTime: 0,
        endTime: 1,
        ai_metadata: { confidence: 0.4 },
        tags: { skipProcessing: true },
      },
      { id: 'u2', startTime: 1.2, endTime: 2.2, ai_metadata: { confidence: 0.95 } },
      { id: 'u3', startTime: 3.5, endTime: 4.5, ai_metadata: { confidence: 0.96 } },
    ]);

    expect(summary.lowConfidenceCount).toBe(0);
    expect(summary.overlapCount).toBe(0);
    expect(summary.gapCount).toBe(1);
  });

  describe('buildRiskHotZones', () => {
    it('clusters nearby signals into risk hot-zones', () => {
      const overlay = buildWaveformAnalysisOverlaySummary([
        { id: 'u1', startTime: 0, endTime: 2, ai_metadata: { confidence: 0.5 } },
        { id: 'u2', startTime: 1, endTime: 3, ai_metadata: { confidence: 0.6 } },
        { id: 'u3', startTime: 10, endTime: 11 },
      ]);
      const zones = buildRiskHotZones(overlay);
      // u1 + u2 低置信度 + overlap 在 1-2 → 应聚为一个热区
      expect(zones.length).toBeGreaterThanOrEqual(1);
      expect(zones[0]!.startTime).toBeLessThanOrEqual(1);
      expect(zones[0]!.endTime).toBeGreaterThanOrEqual(2);
      expect(zones[0]!.signalCount).toBeGreaterThanOrEqual(2);
      expect(zones[0]!.severity).toBeGreaterThan(0);
    });

    it('returns empty when only one signal exists', () => {
      const overlay = buildWaveformAnalysisOverlaySummary([
        { id: 'u1', startTime: 0, endTime: 1, ai_metadata: { confidence: 0.5 } },
      ]);
      // 仅一个信号，无法形成簇
      const zones = buildRiskHotZones(overlay);
      expect(zones).toEqual([]);
    });

    it('limits to maxZones', () => {
      const units = Array.from({ length: 20 }, (_, i) => ({
        id: `u${i}`,
        startTime: i * 10,
        endTime: i * 10 + 2,
        ai_metadata: { confidence: 0.3 },
      }));
      // 插入每个簇的第二信号使其可聚类
      for (let i = 0; i < 20; i++) {
        units.push({
          id: `v${i}`,
          startTime: i * 10 + 0.5,
          endTime: i * 10 + 1.5,
          ai_metadata: { confidence: 0.4 },
        });
      }
      const overlay = buildWaveformAnalysisOverlaySummary(units);
      const zones = buildRiskHotZones(overlay, { maxZones: 3 });
      expect(zones.length).toBeLessThanOrEqual(3);
    });
  });

  describe('temporal distribution in prompt summary', () => {
    it('includes quartile distribution when signals exist', () => {
      const summary = buildWaveformAnalysisPromptSummary(
        [
          { id: 'u1', startTime: 1, endTime: 2, ai_metadata: { confidence: 0.3 } },
          { id: 'u2', startTime: 3, endTime: 4, ai_metadata: { confidence: 0.4 } },
          { id: 'u3', startTime: 7, endTime: 8, ai_metadata: { confidence: 0.5 } },
          { id: 'u4', startTime: 9, endTime: 10, ai_metadata: { confidence: 0.9 } },
        ],
        { audioDurationSec: 12 },
      );

      expect(summary.temporalDistribution).toBeDefined();
      expect(summary.temporalDistribution!.durationSec).toBe(12);
      expect(summary.temporalDistribution!.quartileRatios).toHaveLength(4);
      // Q1=[0,3) 包含 u1(mid=1.5) → 1  Q2=[3,6) 包含 u2(mid=3.5) → 1
      // Q3=[6,9) 包含 u3(mid=7.5) → 1  Q4=[9,12) 无低置信度信号 → 0
      const ratios = summary.temporalDistribution!.quartileRatios;
      expect(ratios.reduce((sum, r) => sum + r, 0)).toBeCloseTo(1, 1);
    });

    it('omits temporal distribution when no signals', () => {
      const summary = buildWaveformAnalysisPromptSummary(
        [{ id: 'u1', startTime: 0, endTime: 5, ai_metadata: { confidence: 0.95 } }],
        { audioDurationSec: 10 },
      );

      expect(summary.temporalDistribution).toBeUndefined();
    });
  });

  describe('VAD-aware gap detection', () => {
    it('marks gap containsSpeech when VAD segments overlap', () => {
      const summary = buildWaveformAnalysisOverlaySummary(
        [
          { id: 'u1', startTime: 0, endTime: 2 },
          { id: 'u2', startTime: 5, endTime: 7 },
        ],
        {
          gapThresholdSeconds: 0.5,
          vadSegments: [{ start: 3, end: 4 }],
        },
      );
      expect(summary.gapBands).toHaveLength(1);
      expect(summary.gapBands[0]!.containsSpeech).toBe(true);
    });

    it('marks gap containsSpeech false when no VAD in gap', () => {
      const summary = buildWaveformAnalysisOverlaySummary(
        [
          { id: 'u1', startTime: 0, endTime: 2 },
          { id: 'u2', startTime: 5, endTime: 7 },
        ],
        {
          gapThresholdSeconds: 0.5,
          vadSegments: [{ start: 8, end: 9 }],
        },
      );
      expect(summary.gapBands).toHaveLength(1);
      expect(summary.gapBands[0]!.containsSpeech).toBe(false);
    });

    it('omits containsSpeech when no vadSegments provided', () => {
      const summary = buildWaveformAnalysisOverlaySummary(
        [
          { id: 'u1', startTime: 0, endTime: 2 },
          { id: 'u2', startTime: 5, endTime: 7 },
        ],
        { gapThresholdSeconds: 0.5 },
      );
      expect(summary.gapBands).toHaveLength(1);
      expect(summary.gapBands[0]!.containsSpeech).toBeUndefined();
    });

    it('reports untranscribedSpeechGapCount in prompt summary', () => {
      const summary = buildWaveformAnalysisPromptSummary(
        [
          { id: 'u1', startTime: 0, endTime: 2, ai_metadata: { confidence: 0.9 } },
          { id: 'u2', startTime: 5, endTime: 7, ai_metadata: { confidence: 0.9 } },
          { id: 'u3', startTime: 10, endTime: 12, ai_metadata: { confidence: 0.9 } },
        ],
        {
          gapThresholdSeconds: 0.5,
          vadSegments: [{ start: 3, end: 4 }], // 只有 u1-u2 间隙含语音
        },
      );
      expect(summary.untranscribedSpeechGapCount).toBe(1);
    });
  });

  describe('covered-interval gaps', () => {
    const enclosed = [
      { id: 'A', startTime: 0, endTime: 10 },
      { id: 'B', startTime: 1, endTime: 2 },
      { id: 'C', startTime: 5, endTime: 6 },
    ];
    const enclosedVad = [{ start: 3, end: 4 }];

    it('does not invent a speech gap inside an enclosing interval', () => {
      const overlay = buildWaveformAnalysisOverlaySummary(enclosed, {
        vadSegments: enclosedVad,
      });
      expect(overlay.gapBands).toEqual([]);

      const summary = buildWaveformAnalysisPromptSummary(enclosed, {
        vadSegments: enclosedVad,
      });
      expect(summary.gapCount).toBe(0);
      expect(summary.maxGapSeconds).toBe(0);
      expect(summary.untranscribedSpeechGapCount ?? 0).toBe(0);
    });

    it('measures the same union when rows are unordered', () => {
      const overlay = buildWaveformAnalysisOverlaySummary(
        [
          { id: 'C', startTime: 5, endTime: 6 },
          { id: 'A', startTime: 0, endTime: 10 },
          { id: 'B', startTime: 1, endTime: 2 },
        ],
        { vadSegments: enclosedVad },
      );
      expect(overlay.gapBands).toEqual([]);
    });

    it('reports only the uncovered remainder after an overlap', () => {
      const units = [
        { id: 'A', startTime: 0, endTime: 10 },
        { id: 'B', startTime: 1, endTime: 2 },
        { id: 'C', startTime: 12, endTime: 14 },
      ];
      const overlay = buildWaveformAnalysisOverlaySummary(units, {
        vadSegments: enclosedVad,
      });
      expect(overlay.gapBands).toEqual([
        {
          id: 'gap:A:C',
          startTime: 10,
          endTime: 12,
          gapSeconds: 2,
          containsSpeech: false,
        },
      ]);

      const insideCover = buildWaveformAnalysisPromptSummary(units, {
        selectionStartTime: 2,
        selectionEndTime: 5,
        vadSegments: enclosedVad,
      });
      expect(insideCover.gapCount).toBe(1);
      expect(insideCover.maxGapSeconds).toBe(2);
      expect(insideCover.selectionGapCount).toBe(0);
      expect(insideCover.untranscribedSpeechGapCount).toBe(0);

      const onHole = buildWaveformAnalysisPromptSummary(units, {
        selectionStartTime: 10,
        selectionEndTime: 12,
        vadSegments: [{ start: 10.5, end: 11.5 }],
      });
      expect(onHole.selectionGapCount).toBe(1);
      expect(onHole.untranscribedSpeechGapCount).toBe(1);
    });

    it('merges transitively overlapping rows, then keeps the later uncovered gap', () => {
      const chain = buildWaveformAnalysisOverlaySummary([
        { id: 'A', startTime: 0, endTime: 3 },
        { id: 'B', startTime: 2, endTime: 5 },
        { id: 'C', startTime: 4, endTime: 7 },
      ]);
      expect(chain.gapBands).toEqual([]);

      const thenGap = buildWaveformAnalysisOverlaySummary([
        { id: 'A', startTime: 0, endTime: 4 },
        { id: 'B', startTime: 3, endTime: 5 },
        { id: 'C', startTime: 4.2, endTime: 4.5 },
        { id: 'D', startTime: 7, endTime: 9 },
      ]);
      expect(thenGap.gapBands).toEqual([
        { id: 'gap:B:D', startTime: 5, endTime: 7, gapSeconds: 2 },
      ]);
    });

    it('does not report adjacent or below-threshold separations', () => {
      const touching = buildWaveformAnalysisOverlaySummary([
        { id: 'A', startTime: 0, endTime: 2 },
        { id: 'B', startTime: 2, endTime: 4 },
      ]);
      expect(touching.gapBands).toEqual([]);

      const belowDefault = buildWaveformAnalysisOverlaySummary([
        { id: 'A', startTime: 0, endTime: 1 },
        { id: 'B', startTime: 1.7, endTime: 3 },
      ]);
      expect(belowDefault.gapBands).toEqual([]);
    });

    it('reports a hole at the default 0.8s threshold and not below it', () => {
      const atThreshold = buildWaveformAnalysisOverlaySummary([
        { id: 'A', startTime: 0, endTime: 1 },
        { id: 'B', startTime: 1.8, endTime: 3 },
      ]);
      expect(atThreshold.gapBands).toEqual([
        { id: 'gap:A:B', startTime: 1, endTime: 1.8, gapSeconds: 0.8 },
      ]);

      const enclosedAtThreshold = buildWaveformAnalysisOverlaySummary([
        { id: 'A', startTime: 0, endTime: 1 },
        { id: 'B', startTime: 0.1, endTime: 0.2 },
        { id: 'C', startTime: 1.8, endTime: 3 },
      ]);
      expect(enclosedAtThreshold.gapBands).toEqual([
        { id: 'gap:A:C', startTime: 1, endTime: 1.8, gapSeconds: 0.8 },
      ]);

      const enclosedBelow = buildWaveformAnalysisOverlaySummary([
        { id: 'A', startTime: 0, endTime: 1 },
        { id: 'B', startTime: 0.1, endTime: 0.2 },
        { id: 'C', startTime: 1.7, endTime: 3 },
      ]);
      expect(enclosedBelow.gapBands).toEqual([]);
    });

    it('keeps real positive gaps on either side of a nested cluster', () => {
      const overlay = buildWaveformAnalysisOverlaySummary(
        [
          { id: 'A', startTime: 0, endTime: 2 },
          { id: 'B', startTime: 5, endTime: 6 },
          { id: 'C', startTime: 5.2, endTime: 5.5 },
          { id: 'D', startTime: 9, endTime: 10 },
        ],
        { vadSegments: [{ start: 3, end: 4 }] },
      );
      expect(overlay.gapBands).toEqual([
        {
          id: 'gap:A:B',
          startTime: 2,
          endTime: 5,
          gapSeconds: 3,
          containsSpeech: true,
        },
        {
          id: 'gap:B:D',
          startTime: 6,
          endTime: 9,
          gapSeconds: 3,
          containsSpeech: false,
        },
      ]);
    });

    it('applies the 0.05s VAD overlap tolerance to the uncovered interval', () => {
      const units = [
        { id: 'A', startTime: 0, endTime: 1 },
        { id: 'B', startTime: 0.1, endTime: 0.2 },
        { id: 'C', startTime: 3, endTime: 4 },
      ];
      const coveredSpeech = buildWaveformAnalysisOverlaySummary(units, {
        vadSegments: [{ start: 0.3, end: 0.9 }],
      });
      expect(coveredSpeech.gapBands).toEqual([
        {
          id: 'gap:A:C',
          startTime: 1,
          endTime: 3,
          gapSeconds: 2,
          containsSpeech: false,
        },
      ]);

      const below = buildWaveformAnalysisOverlaySummary(units, {
        vadSegments: [{ start: 1, end: 1.04 }],
      });
      expect(below.gapBands).toEqual([
        {
          id: 'gap:A:C',
          startTime: 1,
          endTime: 3,
          gapSeconds: 2,
          containsSpeech: false,
        },
      ]);

      const atTolerance = buildWaveformAnalysisOverlaySummary(units, {
        vadSegments: [{ start: 1, end: 1.05 }],
      });
      expect(atTolerance.gapBands[0]?.containsSpeech).toBe(true);
    });

    it('does not let skip-processing, empty, inverted, or non-finite rows cover time', () => {
      const skipped = buildWaveformAnalysisOverlaySummary([
        { id: 'skip', startTime: 0, endTime: 10, tags: { skipProcessing: true } },
        { id: 'B', startTime: 1, endTime: 2 },
        { id: 'C', startTime: 5, endTime: 6 },
      ]);
      expect(skipped.gapBands).toEqual([
        { id: 'gap:B:C', startTime: 2, endTime: 5, gapSeconds: 3 },
      ]);

      const invalid = buildWaveformAnalysisOverlaySummary([
        { id: 'A', startTime: 0, endTime: 10 },
        { id: 'inverted', startTime: 4, endTime: 3 },
        { id: 'empty', startTime: 4, endTime: 4 },
        { id: 'nan', startTime: Number.NaN, endTime: 8 },
        { id: 'C', startTime: 12, endTime: 13 },
      ]);
      expect(invalid.gapBands).toEqual([
        { id: 'gap:A:C', startTime: 10, endTime: 12, gapSeconds: 2 },
      ]);
    });

    it('does not report leading or trailing silence, or fold a short hole into the next gap', () => {
      const interiorOnly = buildWaveformAnalysisOverlaySummary([
        { id: 'A', startTime: 5, endTime: 6 },
        { id: 'B', startTime: 8, endTime: 9 },
      ]);
      expect(interiorOnly.gapBands).toEqual([
        { id: 'gap:A:B', startTime: 6, endTime: 8, gapSeconds: 2 },
      ]);

      const separateHoles = buildWaveformAnalysisOverlaySummary([
        { id: 'A', startTime: 0, endTime: 1 },
        { id: 'B', startTime: 1.5, endTime: 2 },
        { id: 'C', startTime: 4, endTime: 5 },
      ]);
      expect(separateHoles.gapBands).toEqual([
        { id: 'gap:B:C', startTime: 2, endTime: 4, gapSeconds: 2 },
      ]);
    });
  });
});
