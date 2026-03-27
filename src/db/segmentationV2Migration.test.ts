import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  buildV28BackfillPlanForText,
  buildSegmentationV2BackfillRows,
  db,
  exportDatabaseAsJson,
  getDb,
  importDatabaseFromJson,
  type TierDefinitionDocType,
  type UtteranceDocType,
  type UtteranceTextDocType,
} from './index';

const NOW = '2026-03-25T00:00:00.000Z';

describe('buildSegmentationV2BackfillRows', () => {
  it('builds base transcription segments and bridge links for utterance texts', () => {
    const utterances: UtteranceDocType[] = [
      {
        id: 'utt_1',
        textId: 'text_1',
        mediaId: 'media_1',
        startTime: 0,
        endTime: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const tiers: TierDefinitionDocType[] = [
      {
        id: 'tier_trx_old',
        textId: 'text_1',
        key: 'old-transcription',
        name: { default: 'Old Transcription' },
        tierType: 'time-aligned',
        contentType: 'transcription',
        isDefault: false,
        sortOrder: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'tier_trx_default',
        textId: 'text_1',
        key: 'default-transcription',
        name: { default: 'Default Transcription' },
        tierType: 'time-aligned',
        contentType: 'transcription',
        isDefault: true,
        sortOrder: 5,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    // v22 迁移时数据含 tierId 而非 layerId | v22 migration data has tierId, not layerId
    const utteranceTexts: UtteranceTextDocType[] = [
      {
        id: 'utr_1',
        utteranceId: 'utt_1',
        tierId: 'layer_trl_en',
        modality: 'text',
        text: 'hello',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      } as unknown as UtteranceTextDocType,
    ];

    const rows = buildSegmentationV2BackfillRows({
      utterances,
      utteranceTexts,
      tiers,
      nowIso: NOW,
    });

    expect(rows.segments.some((item) => item.id === 'segv22_tier_trx_default_utt_1')).toBe(true);
    expect(rows.segments.some((item) => item.id === 'segv22_layer_trl_en_utt_1')).toBe(true);

    expect(rows.contents).toHaveLength(1);
    expect(rows.contents[0]?.id).toBe('utr_1');
    expect(rows.contents[0]?.segmentId).toBe('segv22_layer_trl_en_utt_1');

    expect(rows.links).toHaveLength(1);
    expect(rows.links[0]?.id).toBe('seglv22_layer_trl_en_utt_1');
    expect(rows.links[0]?.sourceSegmentId).toBe('segv22_tier_trx_default_utt_1');
    expect(rows.links[0]?.targetSegmentId).toBe('segv22_layer_trl_en_utt_1');
  });

  it('keeps migration deterministic and skips rows referencing missing utterances', () => {
    const utterances: UtteranceDocType[] = [
      {
        id: 'utt_2',
        textId: 'text_2',
        mediaId: '',
        startTime: 3,
        endTime: 5,
        startAnchorId: 'a1',
        endAnchorId: 'a2',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const tiers: TierDefinitionDocType[] = [
      {
        id: 'tier_trx_2',
        textId: 'text_2',
        key: 'transcription',
        name: { default: 'Transcription' },
        tierType: 'time-aligned',
        contentType: 'transcription',
        isDefault: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    // v22 迁移时数据含 tierId 而非 layerId | v22 migration data has tierId, not layerId
    const utteranceTexts: UtteranceTextDocType[] = [
      {
        id: 'utr_missing',
        utteranceId: 'utt_missing',
        tierId: 'layer_x',
        modality: 'text',
        text: 'ignored',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      } as unknown as UtteranceTextDocType,
      {
        id: 'utr_2',
        utteranceId: 'utt_2',
        tierId: 'tier_trx_2',
        modality: 'text',
        text: 'same-layer',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      } as unknown as UtteranceTextDocType,
    ];

    const rows = buildSegmentationV2BackfillRows({
      utterances,
      utteranceTexts,
      tiers,
      nowIso: NOW,
    });

    expect(rows.segments).toHaveLength(1);
    expect(rows.segments[0]?.id).toBe('segv22_tier_trx_2_utt_2');
    expect(rows.segments[0]?.mediaId).toBe('__unknown_media__');
    expect(rows.segments[0]?.startAnchorId).toBe('a1');
    expect(rows.segments[0]?.endAnchorId).toBe('a2');

    expect(rows.contents).toHaveLength(1);
    expect(rows.contents[0]?.id).toBe('utr_2');

    expect(rows.links).toHaveLength(0);
  });

  it('keeps migration-related collections stable after snapshot roundtrip', async () => {
    await db.open();
    const database = await getDb();

    await Promise.all([
      db.texts.clear(),
      db.tier_definitions.clear(),
      db.utterances.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
    ]);

    const utterances: UtteranceDocType[] = [
      {
        id: 'utt_rt_1',
        textId: 'text_rt_1',
        mediaId: 'media_rt_1',
        startTime: 0,
        endTime: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utt_rt_2',
        textId: 'text_rt_1',
        mediaId: 'media_rt_1',
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const tiers: TierDefinitionDocType[] = [
      {
        id: 'tier_rt_trx',
        textId: 'text_rt_1',
        key: 'transcription',
        name: { default: 'Transcription' },
        tierType: 'time-aligned',
        contentType: 'transcription',
        isDefault: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'tier_rt_trl',
        textId: 'text_rt_1',
        key: 'translation-en',
        name: { default: 'Translation EN' },
        tierType: 'time-aligned',
        contentType: 'translation',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    await db.texts.bulkPut([
      {
        id: 'text_rt_1',
        title: { default: 'Roundtrip Text' },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.tier_definitions.bulkPut(tiers);
    await db.utterances.bulkPut(utterances);

    await db.layer_units.bulkPut([
      {
        id: 'seg_rt_trl_1',
        textId: 'text_rt_1',
        mediaId: 'media_rt_1',
        layerId: 'tier_rt_trl',
        unitType: 'segment',
        parentUnitId: 'utt_rt_1',
        rootUnitId: 'utt_rt_1',
        startTime: 0,
        endTime: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'seg_rt_trl_2',
        textId: 'text_rt_1',
        mediaId: 'media_rt_1',
        layerId: 'tier_rt_trl',
        unitType: 'segment',
        parentUnitId: 'utt_rt_2',
        rootUnitId: 'utt_rt_2',
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.layer_unit_contents.bulkPut([
      {
        id: 'utr_rt_1',
        textId: 'text_rt_1',
        unitId: 'seg_rt_trl_1',
        layerId: 'tier_rt_trl',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'hello-1',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utr_rt_2',
        textId: 'text_rt_1',
        unitId: 'seg_rt_trl_2',
        layerId: 'tier_rt_trl',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'hello-2',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.unit_relations.bulkPut([
      {
        id: 'rel_rt_1',
        textId: 'text_rt_1',
        sourceUnitId: 'seg_rt_trl_1',
        targetUnitId: 'utt_rt_1',
        relationType: 'derived_from',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'rel_rt_2',
        textId: 'text_rt_1',
        sourceUnitId: 'seg_rt_trl_2',
        targetUnitId: 'utt_rt_2',
        relationType: 'derived_from',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const pickCollections = (snapshot: { collections: Record<string, unknown[]> }) => {
      const keys = [
        'texts',
        'utterances',
        'tier_definitions',
        'layer_units',
        'layer_unit_contents',
        'unit_relations',
      ];
      const stripVolatileFields = (row: unknown): unknown => {
        if (!row || typeof row !== 'object') return row;
        const { provenance: _provenance, ...rest } = row as Record<string, unknown>;
        return rest;
      };
      const normalize = (rows: unknown[]) => [...rows].sort((a, b) => {
        const left = (a as { id?: string }).id ?? '';
        const right = (b as { id?: string }).id ?? '';
        return left.localeCompare(right);
      }).map(stripVolatileFields);
      return Object.fromEntries(keys.map((key) => [key, normalize(snapshot.collections[key] ?? [])]));
    };

    const before = pickCollections(await exportDatabaseAsJson());

    await Promise.all([
      db.texts.clear(),
      db.tier_definitions.clear(),
      db.utterances.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
    ]);

    await importDatabaseFromJson({
      schemaVersion: 2,
      exportedAt: NOW,
      dbName: database.name,
      collections: {
        texts: before.texts,
        utterances: before.utterances,
        tier_definitions: before.tier_definitions,
        layer_units: before.layer_units,
        layer_unit_contents: before.layer_unit_contents,
        unit_relations: before.unit_relations,
      },
    }, { strategy: 'replace-all' });

    const after = pickCollections(await exportDatabaseAsJson());
    expect(after).toEqual(before);
  });
});

describe('buildV28BackfillPlanForText', () => {
  it('creates canonical segv2 rows when content does not exist', () => {
    const utterance: UtteranceDocType = {
      id: 'utt_v28_1',
      textId: 'text_v28',
      mediaId: 'media_v28',
      startTime: 1,
      endTime: 2,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const text: UtteranceTextDocType = {
      id: 'trl_v28_1',
      utteranceId: 'utt_v28_1',
      layerId: 'layer_en',
      modality: 'text',
      text: 'hello',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    const plan = buildV28BackfillPlanForText({
      text,
      utterance,
      nowIso: NOW,
      segmentExists: () => false,
    });

    expect(plan).not.toBeNull();
    expect(plan?.segment.id).toBe('segv2_layer_en_utt_v28_1');
    expect(plan?.content.id).toBe('trl_v28_1');
    expect(plan?.content.segmentId).toBe('segv2_layer_en_utt_v28_1');
  });

  it('repairs content whose segment is missing by re-pointing to canonical segv2 segment', () => {
    const utterance: UtteranceDocType = {
      id: 'utt_v28_2',
      textId: 'text_v28',
      mediaId: 'media_v28',
      startTime: 1,
      endTime: 2,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const text: UtteranceTextDocType = {
      id: 'trl_v28_2',
      utteranceId: 'utt_v28_2',
      layerId: 'layer_zh',
      modality: 'text',
      text: '你好',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    const plan = buildV28BackfillPlanForText({
      text,
      utterance,
      nowIso: NOW,
      existingContent: {
        id: 'trl_v28_2',
        textId: 'text_v28',
        segmentId: 'seg_missing_old',
        layerId: 'layer_zh',
        modality: 'text',
        text: '你好',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: '2026-03-20T00:00:00.000Z',
      },
      segmentExists: (segmentId) => segmentId === 'segv2_layer_zh_utt_v28_2',
    });

    expect(plan).not.toBeNull();
    expect(plan?.content.segmentId).toBe('segv2_layer_zh_utt_v28_2');
    expect(plan?.content.updatedAt).toBe(NOW);
  });

  it('skips when existing content already points to an existing segment', () => {
    const utterance: UtteranceDocType = {
      id: 'utt_v28_3',
      textId: 'text_v28',
      mediaId: 'media_v28',
      startTime: 1,
      endTime: 2,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const text: UtteranceTextDocType = {
      id: 'trl_v28_3',
      utteranceId: 'utt_v28_3',
      layerId: 'layer_fr',
      modality: 'text',
      text: 'bonjour',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    const plan = buildV28BackfillPlanForText({
      text,
      utterance,
      nowIso: NOW,
      existingContent: {
        id: 'trl_v28_3',
        textId: 'text_v28',
        segmentId: 'seg_existing',
        layerId: 'layer_fr',
        modality: 'text',
        text: 'bonjour',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      segmentExists: (segmentId) => segmentId === 'seg_existing',
    });

    expect(plan).toBeNull();
  });
});
