import { describe, expect, it } from 'vitest';
import {
  mergeImportedTimelineMetadata,
  resolveTimelineBindingExtentSec,
  resolveTimelineFitSpanSec,
} from './timelineBindingExtent';

describe('resolveTimelineBindingExtentSec', () => {
  it('takes max of document and acoustic so the longer side stays fully visible', () => {
    // 更长声学：显示跨度跟到声学（完整波形可见 / 可滚），不被文献轴钳制。
    expect(
      resolveTimelineBindingExtentSec({
        documentSpanSec: 200,
        acousticDurationSec: 300,
        hasMediaUrl: true,
        globalPlaybackReady: true,
      }),
    ).toBe(300);
    // 更长文献轴：显示跨度跟到文献（extended document，波形末端后留空轨）。
    expect(
      resolveTimelineBindingExtentSec({
        documentSpanSec: 400,
        acousticDurationSec: 100,
        hasMediaUrl: true,
        globalPlaybackReady: true,
      }),
    ).toBe(400);
  });

  it('uses acoustic when no document span', () => {
    expect(
      resolveTimelineBindingExtentSec({
        documentSpanSec: 0,
        acousticDurationSec: 120,
        hasMediaUrl: true,
        globalPlaybackReady: true,
      }),
    ).toBe(120);
  });
});

describe('resolveTimelineFitSpanSec', () => {
  it('matches binding extent: longer acoustic fills 100% viewport', () => {
    expect(
      resolveTimelineFitSpanSec({
        documentSpanSec: 1800,
        acousticDurationSec: 6700,
        hasMediaUrl: true,
        globalPlaybackReady: true,
      }),
    ).toBe(6700);
  });

  it('uses document span when it exceeds acoustic (extended document)', () => {
    expect(
      resolveTimelineFitSpanSec({
        documentSpanSec: 400,
        acousticDurationSec: 100,
        hasMediaUrl: true,
        globalPlaybackReady: true,
      }),
    ).toBe(400);
  });
});

describe('mergeImportedTimelineMetadata', () => {
  it('caps imported logical duration to established acoustic span', () => {
    const merged = mergeImportedTimelineMetadata(
      { timelineMode: 'media' },
      { timelineMode: 'document', logicalDurationSec: 1800, timebaseLabel: 'logical-second' },
      { establishedDocumentSpanSec: 0, establishedAcousticSec: 200 },
    );
    expect(merged.logicalDurationSec).toBe(200);
    expect(merged.timebaseLabel).toBe('logical-second');
  });

  it('caps imported logical duration to established document span', () => {
    const merged = mergeImportedTimelineMetadata(
      { logicalDurationSec: 250, timelineMode: 'document' },
      { logicalDurationSec: 1800 },
      { establishedDocumentSpanSec: 250, establishedAcousticSec: 100 },
    );
    expect(merged.logicalDurationSec).toBe(250);
  });

  it('allows imported logical when shorter than authority', () => {
    const merged = mergeImportedTimelineMetadata(
      { logicalDurationSec: 300 },
      { logicalDurationSec: 120 },
      { establishedDocumentSpanSec: 300, establishedAcousticSec: 400 },
    );
    expect(merged.logicalDurationSec).toBe(120);
  });

  it('tightens greenfield imported logical to parsed units max end', () => {
    const merged = mergeImportedTimelineMetadata(
      {},
      { logicalDurationSec: 1800, timelineMode: 'document' },
      { establishedDocumentSpanSec: 0, establishedAcousticSec: 0, importedUnitsMaxEndSec: 92 },
    );
    expect(merged.logicalDurationSec).toBe(92);
  });

  it('does not let parsed units max end exceed established acoustic freeze', () => {
    const merged = mergeImportedTimelineMetadata(
      { timelineMode: 'media' },
      { logicalDurationSec: 1800 },
      {
        establishedDocumentSpanSec: 0,
        establishedAcousticSec: 200,
        importedUnitsMaxEndSec: 350,
      },
    );
    expect(merged.logicalDurationSec).toBe(200);
  });
});
