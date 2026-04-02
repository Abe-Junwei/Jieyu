import type {
  JieyuDatabase,
  LayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
import type { EafImportResult } from '../services/EafService';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
import { syncUtteranceTextToSegmentationV2 } from '../services/LayerSegmentationTextService';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { newId, humanizeTierName } from '../utils/transcriptionFormatters';
import { withEafKeyMeta, writeImportLayerNameAudit } from './useImportExport.importHelpers';

type AdditionalTierAnnotation = {
  startTime: number;
  endTime: number;
  text: string;
  annotationId?: string;
};

type InsertedUtterance = {
  id: string;
  startTime: number;
  endTime: number;
  utterance: UtteranceDocType;
};

export async function importAdditionalTiers(input: {
  db: JieyuDatabase;
  now: string;
  textId: string;
  mediaId?: string;
  layers: LayerDocType[];
  additionalTiers: Map<string, AdditionalTierAnnotation[]>;
  insertedUtterances: InsertedUtterance[];
  importedTierMetadata: Map<string, { languageId?: string; orthographyId?: string }>;
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
  transformImportedText: (inputData: {
    text: string;
    sourceOrthographyId?: string;
    targetLayerId?: string;
  }) => Promise<string>;
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
    const humanizedTierForLookup = humanizeTierName(tierName).toLocaleLowerCase('en');
    const indepLayerId =
      existingIndepTrcLayersByName.get(tierName.toLocaleLowerCase('en'))
      ?? existingIndepTrcLayersByName.get(humanizedTierForLookup);
    if (indepLayerId) {
      const firstUtt = input.insertedUtterances[0];
      const importMediaId = input.mediaId ?? firstUtt?.utterance.mediaId;
      const importTextId = firstUtt?.utterance.textId ?? input.textId;
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
        const transformedAnnText = await input.transformImportedText({
          text: annotation.text,
          ...(importedTierMeta?.orthographyId !== undefined ? { sourceOrthographyId: importedTierMeta.orthographyId } : {}),
          targetLayerId: indepLayerId,
        });
        const segNow = new Date().toISOString();
        const segId = newId('seg');
        await LayerSegmentationV2Service.createSegmentWithContentAtomic(
          {
            id: segId,
            textId: importTextId,
            mediaId: importMediaId,
            layerId: indepLayerId,
            startTime: annStart,
            endTime: annEnd,
            createdAt: segNow,
            updatedAt: segNow,
          },
          {
            id: newId('sc'),
            textId: importTextId,
            segmentId: segId,
            layerId: indepLayerId,
            modality: 'text',
            text: transformedAnnText,
            sourceType: 'human',
            createdAt: segNow,
            updatedAt: segNow,
          },
        );
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
          layerId,
          linkType: 'free',
          isPreferred: false,
          createdAt: input.now,
        });
      }
    }

    for (const annotation of annotations) {
      const annStart = Number(annotation.startTime.toFixed(3));
      const annEnd = Number(annotation.endTime.toFixed(3));
      const match = input.insertedUtterances.find(
        (utterance) => Math.abs(utterance.startTime - annStart) < 0.05 && Math.abs(utterance.endTime - annEnd) < 0.05,
      );
      if (match && annotation.text.trim()) {
        const transformedAnnText = await input.transformImportedText({
          text: annotation.text,
          ...(importedTierMeta?.orthographyId !== undefined ? { sourceOrthographyId: importedTierMeta.orthographyId } : {}),
          targetLayerId: layerId,
        });
        const doc: UtteranceTextDocType = {
          id: newId('utr'),
          utteranceId: match.id,
          layerId,
          modality: 'text' as const,
          text: transformedAnnText,
          sourceType: 'human' as const,
          ...(annotation.annotationId ? { externalRef: annotation.annotationId } : {}),
          createdAt: input.now,
          updatedAt: input.now,
        };
        await syncUtteranceTextToSegmentationV2(input.db, match.utterance, doc);
      }
    }
  }

  return {
    tierCount,
    skippedIndependentTierSegmentCount,
  };
}
