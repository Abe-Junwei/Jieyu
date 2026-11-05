// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerUnitContentDocType, LayerUnitDocType } from '../../db/types';
import { createReassignTranslations } from './useTranscriptionUnitActions.timelineMutations';

const syncSpy = vi.fn<
  (unit: LayerUnitDocType, translation: LayerUnitContentDocType) => Promise<void>
>(async () => undefined);
const removeUnitSpy = vi.fn<(unitId: string) => Promise<void>>(async () => undefined);

vi.mock('../../db/storagePortTranscriptionUnits', async () => {
  const actual = await vi.importActual<typeof import('../../db/storagePortTranscriptionUnits')>(
    '../../db/storagePortTranscriptionUnits',
  );
  return {
    ...actual,
    syncTranscriptionUnitText: (unit: LayerUnitDocType, translation: LayerUnitContentDocType) =>
      syncSpy(unit, translation),
  };
});

vi.mock('../../services/LinguisticService', () => ({
  LinguisticService: {
    cleanup: {
      removeUnit: (unitId: string) => removeUnitSpy(unitId),
    },
  },
}));

function makeUnit(id: string): LayerUnitDocType {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id,
    mediaId: 'm1',
    textId: 't1',
    startTime: 0,
    endTime: 1,
    createdAt: now,
    updatedAt: now,
  } as LayerUnitDocType;
}

function makeContent(
  id: string,
  unitId: string,
  text: string,
  layerId = 'layer-a',
): LayerUnitContentDocType {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id,
    unitId,
    layerId,
    modality: 'text',
    text,
    createdAt: now,
    updatedAt: now,
  };
}

describe('createReassignTranslations sequential merge (#514)', () => {
  beforeEach(() => {
    syncSpy.mockClear();
    removeUnitSpy.mockClear();
  });

  it('keeps full concatenated text when merging three or more units onto one survivor', async () => {
    const survivor = makeUnit('u1');
    const translations = [
      makeContent('c1', 'u1', 'A'),
      makeContent('c2', 'u2', 'B'),
      makeContent('c3', 'u3', 'C'),
    ];
    const reassign = createReassignTranslations({
      resolveUnitById: async (id) => (id === 'u1' ? survivor : null),
      translations,
    });

    const first = await reassign('u1', 'u2', '2026-01-01T00:00:01.000Z');
    expect(first.updatedTranslations).toEqual([expect.objectContaining({ id: 'c1', text: 'AB' })]);

    const second = await reassign('u1', 'u3', '2026-01-01T00:00:02.000Z');
    expect(second.updatedTranslations).toEqual([
      expect.objectContaining({ id: 'c1', text: 'ABC' }),
    ]);

    const syncedTexts = syncSpy.mock.calls.map((call) => call[1].text);
    expect(syncedTexts).toContain('ABC');
    expect(syncedTexts.at(-1)).toBe('ABC');
  });
});
