import { describe, expect, it } from 'vitest';
import type { LayerUnitDocType } from '../db';
import { recordingScopeUnitId, resolveVoiceRecordingSourceUnit } from './recordingScopeUnitId';

const baseUnit = (id: string): LayerUnitDocType => ({
  id,
  textId: 't1',
  startTime: 0,
  endTime: 1,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
});

describe('recordingScopeUnitId', () => {
  it('uses parent id for referring segments', () => {
    expect(recordingScopeUnitId({
      id: 'seg-1',
      kind: 'segment',
      parentUnitId: 'host-a',
    })).toBe('host-a');
  });

  it('uses segment id for independent segments', () => {
    expect(recordingScopeUnitId({
      id: 'seg-ind',
      kind: 'segment',
    })).toBe('seg-ind');
  });
});

describe('resolveVoiceRecordingSourceUnit', () => {
  it('resolves independent segment from segmentById', () => {
    const seg = { ...baseUnit('seg-ind'), unitType: 'segment' as const };
    const unitById = new Map<string, LayerUnitDocType>();
    const segmentById = new Map([[seg.id, seg]]);
    const utt = {
      id: seg.id,
      kind: 'segment' as const,
    };
    expect(resolveVoiceRecordingSourceUnit(utt, unitById, segmentById)).toEqual(seg);
  });

  it('prefers host from unitById when parent exists', () => {
    const host = baseUnit('host-a');
    const seg = { ...baseUnit('seg-1'), unitType: 'segment' as const, parentUnitId: host.id };
    const unitById = new Map([[host.id, host]]);
    const segmentById = new Map([[seg.id, seg]]);
    const utt = {
      id: seg.id,
      kind: 'segment' as const,
      parentUnitId: host.id,
    };
    expect(resolveVoiceRecordingSourceUnit(utt, unitById, segmentById)).toEqual(host);
  });
});
