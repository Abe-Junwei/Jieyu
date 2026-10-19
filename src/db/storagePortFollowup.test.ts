import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './engine';
import { storagePort } from './storagePort';
import type {
  AiMessageDoc,
  LayerUnitDocType,
  MediaItemDocType,
  UnitMorphemeDocType,
  UnitTokenDocType,
} from './types';

const NOW = '2026-10-18T00:00:00.000Z';

function unit(id: string, textId: string, mediaId: string, startTime: number): LayerUnitDocType {
  return {
    id,
    textId,
    mediaId,
    layerId: 'layer-a',
    unitType: 'segment',
    startTime,
    endTime: startTime + 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType;
}

describe('storage port follow-up reads and writes', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('lists and saves a media row, then reads it back', async () => {
    const row: MediaItemDocType = {
      id: 'media-a',
      textId: 'text-a',
      filename: 'a.wav',
      duration: 1,
      isOfflineCached: false,
      createdAt: NOW,
      timelineKind: 'acoustic',
      byteLocation: 'none',
      availability: 'missing',
    };
    await expect(storagePort().saveMediaItem(row)).resolves.toBe('media-a');
    await expect(storagePort().listMediaByText('text-a')).resolves.toEqual([row]);
    await expect(storagePort().listMediaByText(' ')).resolves.toEqual([]);
    await expect(db.media_items.get('media-a')).resolves.toMatchObject({ filename: 'a.wav' });
  });

  it('lists tokens and morphemes for one project', async () => {
    const token: UnitTokenDocType = {
      id: 'tok-a',
      textId: 'text-a',
      unitId: 'unit-a',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const morpheme: UnitMorphemeDocType = {
      id: 'morph-a',
      textId: 'text-a',
      unitId: 'unit-a',
      tokenId: 'tok-a',
      form: { default: 'dog' },
      morphemeIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.unit_tokens.put(token);
    await db.unit_tokens.put({ ...token, id: 'tok-b', textId: 'text-b' });
    await db.unit_morphemes.put(morpheme);
    await expect(storagePort().listUnitTokensByText('text-a')).resolves.toEqual([token]);
    await expect(storagePort().listUnitMorphemesByText('text-a')).resolves.toEqual([morpheme]);
    await expect(storagePort().listUnitTokensByText('')).resolves.toEqual([]);
  });

  it('counts units, lists ids, and finds a tier by language', async () => {
    await db.layer_units.bulkPut([
      unit('seg-a', 'text-a', 'media-a', 0),
      unit('seg-b', 'text-a', 'media-a', 1.5),
    ]);
    await db.tier_definitions.put({
      id: 'layer-a',
      textId: 'text-a',
      key: 'tx',
      name: { default: 'tx' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      languageId: 'und',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);
    const port = storagePort();
    await expect(port.countPresentLayerUnits(['seg-a', 'missing', 'seg-a'])).resolves.toBe(2);
    await expect(port.listLayerUnitIdsByText('text-a')).resolves.toEqual(['seg-a', 'seg-b']);
    await expect(port.readTierDefinition('layer-a')).resolves.toMatchObject({ languageId: 'und' });
    await expect(port.listTierIdsByContentLanguage('transcription', 'und')).resolves.toEqual([
      'layer-a',
    ]);
    await expect(port.listLayerUnitsAtMediaStart('media-a', 1.5)).resolves.toEqual([
      unit('seg-b', 'text-a', 'media-a', 1.5),
    ]);
  });

  it('patches an assistant message and reads the new content back', async () => {
    const message: AiMessageDoc = {
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'old',
      status: 'streaming',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.ai_messages.put(message);
    await storagePort().patchAiMessageContent('msg-1', {
      content: 'new',
      status: 'done',
      updatedAt: '2026-10-18T01:00:00.000Z',
    });
    await expect(db.ai_messages.get('msg-1')).resolves.toMatchObject({
      content: 'new',
      status: 'done',
      updatedAt: '2026-10-18T01:00:00.000Z',
    });
    await expect(
      storagePort().patchAiMessageContent('missing', {
        content: 'x',
        status: 'done',
        updatedAt: NOW,
      }),
    ).resolves.toBeUndefined();
  });
});
