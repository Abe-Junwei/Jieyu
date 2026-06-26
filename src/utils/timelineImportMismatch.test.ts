import { describe, expect, it } from 'vitest';
import {
  assessAnnotationImportMismatch,
  assessTimelineImportMismatch,
  resolveTimelineAxisLogicalSpanSec,
} from './timelineImportMismatch';
import { resolvePostImportLogicalExpandTargetSec } from './timelineImportPostApply';

describe('timelineImportMismatch', () => {
  it('resolveTimelineAxisLogicalSpanSec prefers mapping over segment max', () => {
    expect(
      resolveTimelineAxisLogicalSpanSec({
        logicalDurationSecFromMapping: 1800,
        unitsOnCurrentMedia: [{ endTime: 1200 }],
      }),
    ).toBe(1800);
  });

  it('assessTimelineImportMismatch flags acoustic longer than logical span', () => {
    expect(
      assessTimelineImportMismatch({
        importAcousticSec: 6700,
        logicalDurationSecFromMapping: 1800,
        unitsOnCurrentMedia: [{ endTime: 1500 }],
      }),
    ).toEqual([
      {
        kind: 'acoustic_longer_than_logical',
        incomingSec: 6700,
        establishedSpanSec: 1800,
        maxUnitEndSec: 1500,
      },
    ]);
  });

  it('assessTimelineImportMismatch returns no notices for default blank canvas without timed units', () => {
    expect(
      assessTimelineImportMismatch({
        importAcousticSec: 6700,
        logicalDurationSecFromMapping: 13231,
        unitsOnCurrentMedia: [],
      }),
    ).toEqual([]);
    expect(
      assessTimelineImportMismatch({
        importAcousticSec: 300,
        logicalDurationSecFromMapping: 1800,
        unitsOnCurrentMedia: [],
      }),
    ).toEqual([]);
  });

  it('assessTimelineImportMismatch flags acoustic longer than short established logical axis without timed units', () => {
    expect(
      assessTimelineImportMismatch({
        importAcousticSec: 6700,
        logicalDurationSecFromMapping: 400,
        unitsOnCurrentMedia: [],
      }),
    ).toEqual([
      {
        kind: 'acoustic_longer_than_logical',
        incomingSec: 6700,
        establishedSpanSec: 400,
        maxUnitEndSec: 0,
      },
    ]);
  });

  it('assessTimelineImportMismatch flags acoustic shorter than existing segments on replace path', () => {
    expect(
      assessTimelineImportMismatch({
        importAcousticSec: 120,
        logicalDurationSecFromMapping: 3600,
        unitsOnCurrentMedia: [{ endTime: 600 }],
        willRemapOnFirstAcousticBind: false,
      }),
    ).toEqual([
      {
        kind: 'acoustic_shorter_than_segments',
        incomingSec: 120,
        establishedSpanSec: 3600,
        maxUnitEndSec: 600,
      },
    ]);
  });

  it('assessTimelineImportMismatch does not warn remap when only logical metadata exceeds shorter acoustic', () => {
    expect(
      assessTimelineImportMismatch({
        importAcousticSec: 180,
        logicalDurationSecFromMapping: 400,
        unitsOnCurrentMedia: [{ endTime: 80 }],
        willRemapOnFirstAcousticBind: true,
      }),
    ).toEqual([]);
  });

  it('assessTimelineImportMismatch warns first bind will remap when segments exceed shorter acoustic', () => {
    expect(
      assessTimelineImportMismatch({
        importAcousticSec: 120,
        logicalDurationSecFromMapping: 3600,
        unitsOnCurrentMedia: [{ endTime: 600 }],
        willRemapOnFirstAcousticBind: true,
      }),
    ).toEqual([
      {
        kind: 'first_acoustic_bind_will_remap_segments',
        incomingSec: 120,
        establishedSpanSec: 3600,
        maxUnitEndSec: 600,
      },
    ]);
  });

  it('assessAnnotationImportMismatch flags document span longer than established', () => {
    expect(
      assessAnnotationImportMismatch({
        establishedDocumentSpanSec: 1800,
        establishedAcousticSec: 200,
        importedLogicalDurationSec: 3600,
        importedUnitsMaxEndSec: 100,
      }),
    ).toEqual([
      {
        kind: 'document_span_longer_than_established',
        incomingSec: 3600,
        establishedSpanSec: 1800,
        maxUnitEndSec: 100,
      },
    ]);
  });

  it('resolvePostImportLogicalExpandTargetSec picks max incoming span', () => {
    expect(
      resolvePostImportLogicalExpandTargetSec([
        {
          kind: 'acoustic_longer_than_logical',
          incomingSec: 6700,
          establishedSpanSec: 1800,
          maxUnitEndSec: 1500,
        },
      ]),
    ).toBe(6700);
  });
});
