import type {
  JieyuDatabase,
  LayerDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
} from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import {
  getLayerUnitById,
  listLayerUnitContentsByUnitIds,
  listLayerUnitsByTextId,
} from '../../services/LayerUnitSegmentWritePrimitives';
import { LayerTierUnifiedService } from '../../services/LayerTierUnifiedService';
import type { EafTranscriptionTier } from '../../services/EafService';
import { syncUnitTextToSegmentationV2 } from '../../services/LayerSegmentationTextService';
import { newId, humanizeTierName } from '../../utils/transcriptionFormatters';
import { persistImportedTokensForHost } from './useImportExport.additionalTierHandlers';
import {
  findReimportUnitId,
  matchLayerByEafTier,
  type ReimportContentRow,
  type ReimportUnitRow,
} from '../../utils/eafImportAlign';
import {
  withEafKeyMeta,
  writeImportLayerNameAudit,
  type ImportLayerNameSource,
} from './useImportExport.importHelpers';

export async function writeExtraEafTranscriptionTiers(input: {
  db: JieyuDatabase;
  now: string;
  textId: string;
  mediaId?: string;
  layers: LayerDocType[];
  tiers: readonly EafTranscriptionTier[];
  existingUnits: ReimportUnitRow[];
  existingContents: ReimportContentRow[];
  insertedUnits: Array<{
    id: string;
    startTime: number;
    endTime: number;
    annotationId?: string;
    unit: LayerUnitDocType;
  }>;
  rememberLayer: (layer: LayerDocType) => void;
  tierNameToLayerId: Map<string, string>;
  resolveLayerDisplayName: (
    languageTagCandidates: Array<string | undefined>,
    fallbackName: string,
  ) => { label: string; source: ImportLayerNameSource; matchedTag?: string };
  resolveSpeakerId: (speakerCode: string | undefined) => string | undefined;
  lexemeIdByFormKey: Map<string, string>;
}): Promise<void> {
  for (const tier of input.tiers) {
    const display = input.resolveLayerDisplayName(
      [tier.locale, tier.tierName],
      humanizeTierName(tier.tierName),
    );
    const matched = matchLayerByEafTier(input.layers, {
      tierId: tier.tierName,
      layerType: 'transcription',
      ...(tier.locale ? { languageId: tier.locale } : {}),
      displayNames: [tier.tierName, humanizeTierName(tier.tierName), display.label],
    });
    let layerId = matched?.id;
    if (!layerId) {
      layerId = newId('layer');
      const doc: LayerDocType = {
        id: layerId,
        textId: input.textId,
        key: withEafKeyMeta(`trc_import_${Math.random().toString(36).slice(2, 7)}`, {
          externalTierId: tier.tierName,
        }),
        name: { eng: display.label, zho: display.label },
        layerType: 'transcription',
        languageId: tier.locale ?? 'und',
        modality: 'text',
        acceptsAudio: false,
        sortOrder: input.layers.length,
        constraint: 'independent_boundary',
        createdAt: input.now,
        updatedAt: input.now,
      };
      await LayerTierUnifiedService.createLayer(doc);
      await writeImportLayerNameAudit({
        db: input.db,
        now: input.now,
        layerId,
        displayName: display.label,
        source: display.source,
        languageId: tier.locale ?? 'und',
        tierName: tier.tierName,
        ...(display.matchedTag ? { matchedTag: display.matchedTag } : {}),
      });
      input.rememberLayer(doc);
    }
    input.tierNameToLayerId.set(tier.tierName, layerId);

    for (const unit of tier.units) {
      const startTime = Number(unit.startTime.toFixed(3));
      const endTime = Number(unit.endTime.toFixed(3));
      const annotationId = unit.annotationId;
      const existingId = annotationId
        ? findReimportUnitId({
            textId: input.textId,
            layerId,
            annotationId,
            units: input.existingUnits,
            contents: input.existingContents,
          })
        : undefined;
      const id = existingId ?? newId('utt');
      const speakerId = input.resolveSpeakerId(unit.speakerId);
      const stored = existingId ? await getLayerUnitById(input.db, existingId) : undefined;
      const saved: LayerUnitDocType = {
        ...(stored ?? { id, textId: input.textId, createdAt: input.now }),
        id,
        textId: input.textId,
        ...(input.mediaId ? { mediaId: input.mediaId } : {}),
        startTime,
        endTime,
        annotationStatus: stored?.annotationStatus ?? 'raw',
        ...(annotationId ? { externalRef: annotationId } : {}),
        ...(speakerId ? { speakerId } : {}),
        createdAt: stored?.createdAt ?? input.now,
        updatedAt: input.now,
      };
      await LinguisticService.units.save(saved);
      if (existingId && unit.tokens && unit.tokens.length > 0) {
        const oldTokens = await input.db.dexie.unit_tokens.where('unitId').equals(id).toArray();
        const oldMorphs = await input.db.dexie.unit_morphemes.where('unitId').equals(id).toArray();
        const oldIds = [...oldTokens.map((row) => row.id), ...oldMorphs.map((row) => row.id)];
        if (oldIds.length > 0) {
          await input.db.dexie.token_lexeme_links.where('targetId').anyOf(oldIds).delete();
        }
        await input.db.dexie.unit_morphemes.where('unitId').equals(id).delete();
        await input.db.dexie.unit_tokens.where('unitId').equals(id).delete();
      }
      if (unit.tokens && unit.tokens.length > 0) {
        await persistImportedTokensForHost({
          textId: input.textId,
          hostUnitId: id,
          tokens: unit.tokens,
          now: input.now,
          ...(tier.locale ? { language: tier.locale } : {}),
          lexemeIdByFormKey: input.lexemeIdByFormKey,
        });
      }
      if (unit.transcription.trim()) {
        const relatedUnits = existingId
          ? (await listLayerUnitsByTextId(input.db, input.textId)).filter(
              (row) => row.id === id || row.parentUnitId === id,
            )
          : [];
        const contentRows =
          relatedUnits.length > 0
            ? await listLayerUnitContentsByUnitIds(
                input.db,
                relatedUnits.map((row) => row.id),
              )
            : [];
        const prior = contentRows.find(
          (row) =>
            row.layerId === layerId && (row.modality === undefined || row.modality === 'text'),
        );
        const content: LayerUnitContentDocType = prior
          ? {
              ...prior,
              text: unit.transcription,
              ...(annotationId ? { externalRef: annotationId } : {}),
              updatedAt: input.now,
            }
          : {
              id: newId('utr'),
              unitId: id,
              layerId,
              modality: 'text',
              text: unit.transcription,
              sourceType: 'human',
              ...(annotationId ? { externalRef: annotationId } : {}),
              createdAt: input.now,
              updatedAt: input.now,
            };
        await syncUnitTextToSegmentationV2(input.db, saved, content);
        input.existingContents.push({
          unitId: id,
          layerId,
          ...(annotationId ? { externalRef: annotationId } : {}),
        });
      }
      input.existingUnits.push({
        id,
        textId: input.textId,
        ...(annotationId ? { externalRef: annotationId } : {}),
      });
      input.insertedUnits.push({
        id,
        startTime,
        endTime,
        ...(annotationId ? { annotationId } : {}),
        unit: saved,
      });
    }
  }
}
