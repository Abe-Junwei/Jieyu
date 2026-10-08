// @vitest-environment jsdom
/**
 * JY-10：没有默认转写层时 units.save / saveBatch 显式失败：不写库、不返回假 id、不广播 unit-updated。
 * JY-10: units.save / saveBatch fail explicitly without a default transcription layer: no write,
 * no fake id, no unit-updated broadcast.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, type LayerUnitDocType } from '../db';
import { putTestDefaultTranscriptionLayer } from '../db/putTestUnitAsLayerUnit';
import { WORKSPACE_UNIT_UPDATED_EVENT } from '../utils/workspaceEvents';
import { DefaultTranscriptionLayerMissingError } from './LayerSegmentGraphService';
import { LinguisticService } from './LinguisticService';

const NOW = '2026-10-09T00:00:00.000Z';

function unit(id: string, textId: string): LayerUnitDocType {
  return {
    id,
    textId,
    mediaId: 'media-jy10',
    startTime: 0,
    endTime: 1,
    transcription: { default: id },
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType;
}

let broadcasts: string[] = [];
const onUnitUpdated = (event: Event) => {
  broadcasts.push((event as CustomEvent<{ unitId: string }>).detail.unitId);
};

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  broadcasts = [];
  window.addEventListener(WORKSPACE_UNIT_UPDATED_EVENT, onUnitUpdated);
});

afterEach(() => {
  window.removeEventListener(WORKSPACE_UNIT_UPDATED_EVENT, onUnitUpdated);
});

describe('JY-10: unit writes without a default transcription layer', () => {
  it('units.save rejects with a typed error, writes nothing and does not broadcast', async () => {
    const error = await LinguisticService.units
      .save(unit('u-missing', 'text-no-layer'))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DefaultTranscriptionLayerMissingError);
    expect((error as DefaultTranscriptionLayerMissingError).textId).toBe('text-no-layer');
    expect(await db.layer_units.count()).toBe(0);
    expect(await db.layer_unit_contents.count()).toBe(0);
    expect(broadcasts).toEqual([]);
  });

  it('saveBatch fails before writing any unit when one project lacks the layer', async () => {
    await putTestDefaultTranscriptionLayer(db, 'text-with-layer');
    await expect(
      LinguisticService.units.saveBatch([
        unit('u-ok', 'text-with-layer'),
        unit('u-missing', 'text-no-layer'),
      ]),
    ).rejects.toBeInstanceOf(DefaultTranscriptionLayerMissingError);
    expect(await db.layer_units.count()).toBe(0);
    expect(broadcasts).toEqual([]);
  });

  it('still saves and broadcasts once the project has a transcription layer', async () => {
    await putTestDefaultTranscriptionLayer(db, 'text-with-layer');
    await expect(LinguisticService.units.save(unit('u-ok', 'text-with-layer'))).resolves.toBe(
      'u-ok',
    );
    expect(await db.layer_units.get('u-ok')).toBeDefined();
    expect(broadcasts).toEqual(['u-ok']);
  });
});
