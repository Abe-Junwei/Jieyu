import { describe, expect, it } from 'vitest';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/transcription/useTimelineUnitViewIndex';
import { buildTimelineReadModel } from './timelineReadModel';
import {
  resolveReadyWorkspaceDocumentSpanSec,
  resolveReadyWorkspaceGlobalPlayableAcoustic,
  resolveReadyWorkspaceTimelineExtentSec,
} from './readyWorkspaceTimelineExtents';

function createEmptyIndex(epoch = 1): TimelineUnitViewIndexWithEpoch {
  return {
    allUnits: [],
    currentMediaUnits: [],
    byId: new Map(),
    resolveBySemanticId: () => undefined,
    byLayer: new Map(),
    getReferringUnits: () => [],
    totalCount: 0,
    currentMediaCount: 0,
    epoch,
    fallbackToSegments: false,
    isComplete: true,
  };
}

describe('readyWorkspaceTimelineExtents', () => {
  it('matches buildTimelineReadModel extent when document span and player facts align', () => {
    const documentSpanSec = resolveReadyWorkspaceDocumentSpanSec({
      activeTextTimeLogicalDurationSec: 120,
      unitsOnCurrentMedia: [{ endTime: 90 }],
    });
    const globalPlayableAcoustic = resolveReadyWorkspaceGlobalPlayableAcoustic({
      selectedMediaUrl: 'blob:audio',
      playerIsReady: true,
      playerDuration: 200,
    });
    const bridgeExtent = resolveReadyWorkspaceTimelineExtentSec({
      documentSpanSec,
      selectedMediaUrl: 'blob:audio',
      globalPlayableAcoustic,
      playerDuration: 200,
    });
    const readModel = buildTimelineReadModel({
      unitIndex: createEmptyIndex(),
      transcriptionLayerIds: ['trc-1'],
      translationLayerIds: [],
      selectedTimelineUnit: null,
      selectedUnitIds: [],
      playerIsReady: true,
      playerDuration: 200,
      selectedMediaUrl: 'blob:audio',
      documentSpanSec,
      orchestratorLayersCount: 1,
    });
    expect(bridgeExtent).toBe(readModel.timeline.extentSec);
    expect(bridgeExtent).toBe(200);
  });

  it('keeps literature span while media is pending decode', () => {
    const documentSpanSec = resolveReadyWorkspaceDocumentSpanSec({
      activeTextTimeLogicalDurationSec: 150,
      unitsOnCurrentMedia: [],
    });
    expect(
      resolveReadyWorkspaceTimelineExtentSec({
        documentSpanSec,
        selectedMediaUrl: 'blob:pending',
        globalPlayableAcoustic: false,
        playerDuration: 0,
      }),
    ).toBe(150);
  });
});
