/**
 * JY-01：层的 displaySettings / dialect / vernacular 经 tier_definitions 往返不丢失。
 * JY-01: layer displaySettings / dialect / vernacular survive the tier_definitions round trip.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb } from '.';
import type {
  LayerDocType,
  TierDefinitionDocType,
  TranscriptionLayerDocType,
  TranslationLayerDocType,
} from '.';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';

const NOW = '2026-10-09T00:00:00.000Z';
const T = 'text-jy01';

/**
 * 类型级守卫：层的每个字段都必须在 TierDefinition 上有落点（改名映射的除外）。
 * Type-level guard: every layer field must have a home on TierDefinition (renamed fields excepted).
 */
type RenamedLayerFields = 'layerType' | 'constraint' | 'parentLayerId';
type LayerFieldsWithoutTierHome = Exclude<
  keyof TranscriptionLayerDocType | keyof TranslationLayerDocType,
  keyof TierDefinitionDocType | RenamedLayerFields
>;
const everyLayerFieldHasATierHome: [LayerFieldsWithoutTierHome] extends [never] ? true : false =
  true;

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  await db.texts.put({ id: T, title: { default: 'JY-01' }, createdAt: NOW, updatedAt: NOW });
});

async function reload(id: string): Promise<LayerDocType | undefined> {
  const jdb = await getDb();
  return (await jdb.collections.layers.findOne({ selector: { id } }).exec())?.toJSON();
}

describe('JY-01: layer fields persisted through TierBackedLayerCollectionAdapter', () => {
  it('displaySettings / dialect / vernacular survive updateLayer + reload', async () => {
    expect(everyLayerFieldHasATierHome).toBe(true);
    const layer: LayerDocType = {
      id: 'layer-1',
      textId: T,
      key: 'trc_1',
      name: { zho: '转写', eng: 'Transcription' },
      layerType: 'transcription',
      languageId: 'cmn',
      modality: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await LayerTierUnifiedService.createLayer(layer);
    await LayerTierUnifiedService.updateLayer({
      ...layer,
      dialect: '西南官话',
      vernacular: '成都话',
      displaySettings: { fontSize: 22, bold: true, color: '#c00', fontFamily: 'Noto Serif' },
      updatedAt: NOW,
    });
    const reloaded = await reload('layer-1');
    expect(reloaded?.displaySettings).toEqual({
      fontSize: 22,
      bold: true,
      color: '#c00',
      fontFamily: 'Noto Serif',
    });
    expect(reloaded?.dialect).toBe('西南官话');
    expect(reloaded?.vernacular).toBe('成都话');
  });

  it('round-trips every optional layer field', async () => {
    const full: LayerDocType = {
      id: 'layer-full',
      textId: T,
      key: 'trc_full',
      name: { eng: 'Full' },
      layerType: 'transcription',
      languageId: 'eng',
      dialect: 'd',
      vernacular: 'v',
      orthographyId: 'orth-1',
      bridgeId: 'bridge-1',
      modality: 'mixed',
      acceptsAudio: true,
      isDefault: true,
      sortOrder: 3,
      constraint: 'time_subdivision',
      displaySettings: {
        fontFamily: 'Serif',
        fontSize: 14,
        bold: false,
        italic: true,
        color: '#123',
      },
      accessRights: 'restricted',
      documentId: 'doc-1',
      parentLayerId: 'layer-parent',
      createdAt: NOW,
      updatedAt: NOW,
    };
    const jdb = await getDb();
    await jdb.collections.layers.insert(full);
    expect(await reload('layer-full')).toEqual(full);
  });
});
