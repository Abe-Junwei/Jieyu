import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LayerDocType } from '../db';
import { db, getDb } from '../db';
import { LinguisticService } from './LinguisticService';

async function clearTables(): Promise<void> {
  await Promise.all([
    db.embeddings.clear(),
    db.layer_units.clear(),
    db.layer_unit_contents.clear(),
    db.unit_relations.clear(),
    db.tier_definitions.clear(),
  ]);
}

describe('LinguisticService embedding invalidation', () => {
  beforeEach(async () => {
    await db.open();
    await clearTables();
  });

  it('invalidates utterance embeddings when embedded default transcription changes', async () => {
    const now = new Date().toISOString();

    const trcLayer: LayerDocType = {
      id: 'trc_embed_default',
      textId: 'text_embed',
      key: 'trc_embed',
      name: { default: 'Transcription' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    };
    await (await getDb()).collections.layers.insert(trcLayer);

    await LinguisticService.saveUtterance({
      id: 'utt_embed_1',
      textId: 'text_embed',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'old text' },
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    });

    await db.embeddings.put({
      id: 'utterance::utt_embed_1::model::v1',
      sourceType: 'utterance',
      sourceId: 'utt_embed_1',
      model: 'model',
      modelVersion: 'v1',
      contentHash: 'hash_old',
      vector: [0.1, 0.2],
      createdAt: now,
    });

    await LinguisticService.saveUtterance({
      id: 'utt_embed_1',
      textId: 'text_embed',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'new text' },
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    });

    expect(await db.embeddings.where('sourceId').equals('utt_embed_1').count()).toBe(0);
  });

  it('removes utterance embeddings when utterances are batch-deleted', async () => {
    const now = new Date().toISOString();

    await LinguisticService.saveUtterancesBatch([
      {
        id: 'utt_batch_1',
        textId: 'text_batch',
        mediaId: 'media_batch',
        startTime: 0,
        endTime: 1,
        annotationStatus: 'raw',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'utt_batch_2',
        textId: 'text_batch',
        mediaId: 'media_batch',
        startTime: 1,
        endTime: 2,
        annotationStatus: 'raw',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await db.embeddings.bulkPut([
      {
        id: 'utterance::utt_batch_1::model::v1',
        sourceType: 'utterance',
        sourceId: 'utt_batch_1',
        model: 'model',
        modelVersion: 'v1',
        contentHash: 'hash_1',
        vector: [0.1, 0.2],
        createdAt: now,
      },
      {
        id: 'utterance::utt_batch_2::model::v1',
        sourceType: 'utterance',
        sourceId: 'utt_batch_2',
        model: 'model',
        modelVersion: 'v1',
        contentHash: 'hash_2',
        vector: [0.2, 0.3],
        createdAt: now,
      },
    ]);

    await LinguisticService.removeUtterancesBatch(['utt_batch_1', 'utt_batch_2']);

    expect(await db.embeddings.where('sourceType').equals('utterance').count()).toBe(0);
  });
});
