import type { JieyuDatabase, LayerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import type { EafImportResult } from '../services/EafService';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
import { syncUnitTextToSegmentationV2 } from '../services/LayerSegmentationTextService';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { newId, humanizeTierName } from '../utils/transcriptionFormatters';
import { withEafKeyMeta, writeImportLayerNameAudit } from './useImportExport.importHelpers';

type AdditionalTierAnnotation = {
  startTime: number;
  endTime: number;
  text: string;
  annotationId?: string;
};

type InsertedUnit = {
  id: string;
  startTime: number;
  endTime: number;
  unit: LayerUnitDocType;
};

export async function importAdditionalTiers(input: {
  db: JieyuDatabase;
  now: string;
  textId: string;
  mediaId?: string;
  layers: LayerDocType[];
  additionalTiers: Map<string, AdditionalTierAnnotation[]>;
  insertedUnits: InsertedUnit[];
  importedTierMetadata: Map<string, { languageId?: string; orthographyId?: string; bridgeId?: string }>;
  tierNameToLayerId: Map<string, string>;
  effectiveTranscriptionLayerId?: string;
  autoCreatedLayerKey?: string;
  eafResult: EafImportResult | null;
  glossLanguage?: string;
  resolveDbLanguageName: (languageTagOrId?: string) => string | undefined;
  resolveEafLanguageLabel: (languageTagOrId?: string) => string | undefined;
  resolveLayerDisplayName: (
    languageTagCandidates: Array<string | undefined>,
    fallbackName: string,
  ) => { label: string; source: 'db' | 'eaf' | 'fallback'; matchedTag?: string };
  planImportedWrites: (inputData: {
    text: string;
    sourceOrthographyId?: string;
    targetLayerId?: string;
    bridgeId?: string;
    baseLabel: string;
    languageId: string;
    layerType: LayerDocType['layerType'];
    keyPrefix: string;
    constraint?: LayerDocType['constraint'];
    parentLayerId?: string;
    tierName?: string;
  }) => Promise<Array<{ layerId: string; text: string }>>;
  rememberLayer: (layer: LayerDocType) => void;
}) {
  let tierCount = 0;
  let skippedIndependentTierSegmentCount = 0;

  const existingTrcLayers = [
    ...input.layers.filter((layer) => layer.layerType === 'transcription'),
    ...(input.autoCreatedLayerKey && input.effectiveTranscriptionLayerId
      ? [{ key: input.autoCreatedLayerKey, id: input.effectiveTranscriptionLayerId }]
      : []),
  ];

  if (input.additionalTiers.size > 0 && existingTrcLayers.length === 0) {
    console.warn('[Import] Skipped translation tier import: no transcription layer exists');
  }

  const existingTrlByName = new Map(
    input.layers
      .filter((layer) => layer.layerType === 'translation')
      .map((layer) => {
        const engName = typeof layer.name === 'object' && layer.name !== null ? (layer.name as Record<string, string>).eng ?? '' : '';
        return [engName.toLocaleLowerCase('en'), layer] as const;
      })
      .filter(([name]) => name.length > 0),
  );

  const existingIndepTrcLayersByName = new Map<string, string>();
  for (const layer of input.layers) {
    if (layer.layerType === 'transcription' && layer.constraint === 'independent_boundary') {
      const engName = typeof layer.name === 'object' && layer.name !== null ? (layer.name as Record<string, string>).eng ?? '' : '';
      if (engName) existingIndepTrcLayersByName.set(engName.toLocaleLowerCase('en'), layer.id);
      if (layer.key) existingIndepTrcLayersByName.set(layer.key.toLocaleLowerCase('en'), layer.id);
    }
  }

  for (const [tierName, annotations] of input.additionalTiers) {
    if (annotations.length === 0) continue;
    if (existingTrcLayers.length === 0) continue;
    const importedTierMeta = input.importedTierMetadata.get(tierName);
    const importedTierBridgeId = importedTierMeta?.bridgeId;
    const humanizedTierForLookup = humanizeTierName(tierName).toLocaleLowerCase('en');
    const indepLayerId =
      existingIndepTrcLayersByName.get(tierName.toLocaleLowerCase('en'))
      ?? existingIndepTrcLayersByName.get(humanizedTierForLookup);
    if (indepLayerId) {
      const firstUtt = input.insertedUnits[0];
      const importMediaId = input.mediaId ?? firstUtt?.unit.mediaId;
      const importTextId = firstUtt?.unit.textId ?? input.textId;
      if (!importMediaId) {
        skippedIndependentTierSegmentCount += annotations.filter((annotation) => annotation.text.trim()).length;
        console.warn('[Import] Skipped independent transcription tier import: missing media, cannot restore segments', {
          tierName,
          layerId: indepLayerId,
          annotationCount: annotations.length,
        });
        continue;
      }
      for (const annotation of annotations) {
        if (!annotation.text.trim()) continue;
        const annStart = Number(annotation.startTime.toFixed(3));
        const annEnd = Number(annotation.endTime.toFixed(3));
        if (annEnd - annStart < 0.01) continue;
        const writes = await input.planImportedWrites({
          text: annotation.text,
          ...(importedTierMeta?.orthographyId !== undefined ? { sourceOrthographyId: importedTierMeta.orthographyId } : {}),
          ...(importedTierBridgeId !== undefined ? { bridgeId: importedTierBridgeId } : {}),
          targetLayerId: indepLayerId,
          baseLabel: humanizeTierName(tierName),
          languageId: importedTierMeta?.languageId ?? 'und',
          layerType: 'transcription',
          keyPrefix: 'trc_import_source',
          constraint: 'independent_boundary',
          tierName,
        });
        const segNow = new Date().toISOString();
        for (const write of writes) {
          const segId = newId('seg');
          await LayerSegmentationV2Service.createSegmentWithContentAtomic(
            {
              id: segId,
              textId: importTextId,
              mediaId: importMediaId,
              layerId: write.layerId,
              startTime: annStart,
              endTime: annEnd,
              createdAt: segNow,
              updatedAt: segNow,
            },
            {
              id: newId('sc'),
              textId: importTextId,
              segmentId: segId,
              layerId: write.layerId,
              modality: 'text',
              text: write.text,
              sourceType: 'human',
              createdAt: segNow,
              updatedAt: segNow,
            },
          );
        }
      }
      continue;
    }

    const tierLang = importedTierMeta?.languageId
      ?? input.eafResult?.tierLocales?.get(tierName)
      ?? input.glossLanguage
      ?? 'und';

    const humanizedName = humanizeTierName(tierName);
    const dbResolvedName = input.resolveDbLanguageName(tierName)
      ?? input.resolveDbLanguageName(tierLang);
    const existingMatch = existingTrlByName.get(tierName.toLocaleLowerCase('en'))
      ?? existingTrlByName.get(humanizedName.toLocaleLowerCase('en'))
      ?? (dbResolvedName ? existingTrlByName.get(dbResolvedName.toLocaleLowerCase('en')) : undefined);
    let layerId: string;
    if (existingMatch) {
      layerId = existingMatch.id;
    } else {
      tierCount++;
      layerId = newId('layer');
      const suffix = Math.random().toString(36).slice(2, 7);
      const baseKey = `trl_import_${suffix}`;
      const trlDisplayName = input.resolveLayerDisplayName([tierLang, tierName], humanizedName);
      const langLabel = trlDisplayName.label;
      const eafTrlLangLabel = input.resolveEafLanguageLabel(tierLang)
        ?? input.resolveEafLanguageLabel(tierName);
      const key = input.eafResult
        ? withEafKeyMeta(baseKey, {
          externalTierId: tierName,
          ...(eafTrlLangLabel ? { langLabel: eafTrlLangLabel } : {}),
        })
        : baseKey;
      const eafTierConstraint = input.eafResult?.tierConstraints?.get(tierName);
      const parentTierId = eafTierConstraint?.parentTierId;
      const mappedParentLayerId = parentTierId ? input.tierNameToLayerId.get(parentTierId) : undefined;
      const fallbackParentLayerId = eafTierConstraint
        && eafTierConstraint.constraint !== 'independent_boundary'
        ? (existingTrcLayers[existingTrcLayers.length - 1]?.id ?? input.effectiveTranscriptionLayerId)
        : undefined;
      const parentLayerId = mappedParentLayerId ?? fallbackParentLayerId;

      const newLayer: LayerDocType = {
        id: layerId,
        textId: input.textId,
        key,
        name: { eng: langLabel, zho: langLabel },
        layerType: 'translation' as const,
        languageId: tierLang,
        ...(importedTierMeta?.orthographyId ? { orthographyId: importedTierMeta.orthographyId } : {}),
        ...(importedTierBridgeId
          ? { bridgeId: importedTierBridgeId }
          : {}),
        modality: 'text' as const,
        acceptsAudio: false,
        sortOrder: tierCount + 1,
        ...(eafTierConstraint ? { constraint: eafTierConstraint.constraint } : {}),
        ...(parentLayerId ? { parentLayerId } : {}),
        createdAt: input.now,
        updatedAt: input.now,
      };
      await LayerTierUnifiedService.createLayer(newLayer);
      input.rememberLayer(newLayer);
      input.tierNameToLayerId.set(tierName, layerId);
      await writeImportLayerNameAudit({
        db: input.db,
        now: input.now,
        layerId,
        displayName: langLabel,
        source: trlDisplayName.source,
        languageId: tierLang,
        tierName,
        ...(trlDisplayName.matchedTag ? { matchedTag: trlDisplayName.matchedTag } : {}),
      });

      for (const transcriptionLayer of existingTrcLayers) {
        await input.db.collections.layer_links.insert({
          id: newId('link'),
          transcriptionLayerKey: transcriptionLayer.key,
          hostTranscriptionLayerId: transcriptionLayer.id,
          layerId,
          linkType: 'free',
          isPreferred: false,
          createdAt: input.now,
        });
      }
    }

    const translationBaseLabel = existingMatch && typeof existingMatch.name === 'object' && existingMatch.name !== null
      ? ((existingMatch.name as Record<string, string>).zho ?? (existingMatch.name as Record<string, string>).eng ?? humanizedName)
      : humanizedName;

    for (const annotation of annotations) {
      const annStart = Number(annotation.startTime.toFixed(3));
      const annEnd = Number(annotation.endTime.toFixed(3));
      const match = input.insertedUnits.find(
        (unit) => Math.abs(unit.startTime - annStart) < 0.05 && Math.abs(unit.endTime - annEnd) < 0.05,
      );
      if (match && annotation.text.trim()) {
        const writes = await input.planImportedWrites({
          text: annotation.text,
          ...(importedTierMeta?.orthographyId !== undefined ? { sourceOrthographyId: importedTierMeta.orthographyId } : {}),
          ...(importedTierBridgeId !== undefined ? { bridgeId: importedTierBridgeId } : {}),
          targetLayerId: layerId,
          baseLabel: translationBaseLabel,
          languageId: tierLang,
          layerType: 'translation',
          keyPrefix: 'trl_import_source',
          ...(input.eafResult?.tierConstraints?.get(tierName)?.constraint ? { constraint: input.eafResult.tierConstraints.get(tierName)?.constraint } : {}),
          ...(existingMatch?.parentLayerId ? { parentLayerId: existingMatch.parentLayerId } : {}),
          tierName,
        });
        for (const write of writes) {
          const doc: LayerUnitContentDocType = {
            id: newId('utr'),
            unitId: match.id,
            layerId: write.layerId,
            modality: 'text' as const,
            text: write.text,
            sourceType: 'human' as const,
            ...(annotation.annotationId ? { externalRef: annotation.annotationId } : {}),
            createdAt: input.now,
            updatedAt: input.now,
          };
          await syncUnitTextToSegmentationV2(input.db, match.unit, doc);
        }
      }
    }
  }

  return {
    tierCount,
    skippedIndependentTierSegmentCount,
  };
}
