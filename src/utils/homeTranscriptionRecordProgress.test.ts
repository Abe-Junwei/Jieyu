import { describe, expect, it } from 'vitest';
import {
  aggregateProjectProgressRates,
  computeAnnotationProgressRate,
  computeTranslationProgressRate,
  pickTextTitle,
} from './homeTranscriptionRecordProgress';
import type { MediaItemDocType, SegmentMetaDocType, TextDocType, TranslationStatusSnapshotDocType } from '../db/types';
import { isAuxiliaryRecordingMediaRow, isMediaItemPlaceholderRow } from './mediaItemTimelineKind';

describe('computeTranslationProgressRate', () => {
  it('returns null when no rows', () => {
    expect(computeTranslationProgressRate([])).toBeNull();
  });

  it('counts translated and verified', () => {
    const rows = [
      { status: 'missing' },
      { status: 'draft' },
      { status: 'translated' },
      { status: 'verified' },
    ] as TranslationStatusSnapshotDocType[];
    expect(computeTranslationProgressRate(rows)).toBeCloseTo(0.5);
  });
});

describe('computeAnnotationProgressRate', () => {
  it('returns null when no segments with text', () => {
    const rows = [
      { unitKind: 'segment', hasText: false, annotationStatus: 'raw' },
    ] as SegmentMetaDocType[];
    expect(computeAnnotationProgressRate(rows)).toBeNull();
  });

  it('counts glossed and verified among segments with text', () => {
    const rows = [
      { unitKind: 'segment', hasText: true, annotationStatus: 'transcribed' },
      { unitKind: 'segment', hasText: true, annotationStatus: 'glossed' },
      { unitKind: 'segment', hasText: true, annotationStatus: 'verified' },
    ] as SegmentMetaDocType[];
    expect(computeAnnotationProgressRate(rows)).toBeCloseTo(2 / 3);
  });
});

describe('aggregateProjectProgressRates', () => {
  it('weights transcription by unit count', () => {
    const agg = aggregateProjectProgressRates([
      {
        kind: 'transcription_record',
        mediaId: 'a',
        filename: 'a.wav',
        transcriptionRate: 0,
        translationRate: null,
        annotationRate: null,
        transcriptionUnitCount: 3,
        translationRowCount: 0,
      },
      {
        kind: 'transcription_record',
        mediaId: 'b',
        filename: 'b.wav',
        transcriptionRate: 1,
        translationRate: null,
        annotationRate: null,
        transcriptionUnitCount: 1,
        translationRowCount: 0,
      },
    ]);
    expect(agg.transcription).toBeCloseTo(0.25);
  });
});

describe('home page media filter (align with project hub)', () => {
  it('drops placeholder and auxiliary recording media rows', () => {
    const rows = [
      {
        id: 'acoustic',
        textId: 't',
        filename: 'story.wav',
        isOfflineCached: false,
        createdAt: '',
        details: { timelineKind: 'acoustic' as const },
      },
      {
        id: 'aux-trl',
        textId: 't',
        filename: 'trl_zho_ul3ci-media_1776984871604_x.webm',
        isOfflineCached: false,
        createdAt: '',
        details: { source: 'translation-recording' },
      },
      {
        id: 'ph',
        textId: 't',
        filename: 'document-placeholder.track',
        isOfflineCached: false,
        createdAt: '',
        details: {},
      },
    ] as MediaItemDocType[];
    const filtered = rows.filter((m) => !isMediaItemPlaceholderRow(m) && !isAuxiliaryRecordingMediaRow(m));
    expect(filtered.map((m) => m.id)).toEqual(['acoustic']);
  });
});

describe('pickTextTitle', () => {
  it('prefers locale-specific title', () => {
    const text = {
      id: 't1',
      title: { eng: 'English', 'zh-CN': '中文' },
      createdAt: '',
      updatedAt: '',
    } as TextDocType;
    expect(pickTextTitle(text, 'zh-CN')).toBe('中文');
    expect(pickTextTitle(text, 'en-US')).toBe('English');
  });
});
