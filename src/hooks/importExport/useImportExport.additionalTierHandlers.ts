import type {
  JieyuDatabase,
  LayerDocType,
  LayerUnitDocType,
  LayerUnitContentDocType,
  TokenLexemeLinkDocType,
  UnitMorphemeDocType,
  UnitTokenDocType,
} from '../../db';
import { getDb } from '../../db';
import type { EafImportResult } from '../../services/EafService';
import { LinguisticService } from '../../services/LinguisticService';
import { LayerTierUnifiedService } from '../../services/LayerTierUnifiedService';
import { syncUnitTextToSegmentationV2 } from '../../services/LayerSegmentationTextService';
import { LayerSegmentationV2Service } from '../../services/LayerSegmentationV2Service';
import { LayerUnitSegmentWriteService } from '../../services/LayerUnitSegmentWriteService';
import { newId, humanizeTierName } from '../../utils/transcriptionFormatters';
import { createLogger } from '../../observability/logger';
import {
  resolvePreferredHostTranscriptionLayerIdForTranslationImport,
  withEafKeyMeta,
  writeImportLayerNameAudit,
} from './useImportExport.importHelpers';

type AdditionalTierToken = {
  form: Record<string, string>;
  gloss?: Record<string, string>;
  pos?: string;
  morphemes?: Array<{
    form: Record<string, string>;
    gloss?: Record<string, string>;
    pos?: string;
  }>;
};

type AdditionalTierAnnotation = {
  startTime: number;
  endTime: number;
  text: string;
  annotationId?: string;
  tokens?: AdditionalTierToken[];
};

async function resolveFormLexemeId(
  form: Record<string, string>,
  language: string | undefined,
  cache: Map<string, string>,
): Promise<string | undefined> {
  const surface =
    (typeof form.default === 'string' && form.default.trim()) ||
    (typeof form.eng === 'string' && form.eng.trim()) ||
    Object.values(form)
      .find((value) => typeof value === 'string' && value.trim())
      ?.trim();
  if (!surface) return undefined;
  const lang = language?.trim() || undefined;
  const cacheKey = `${lang ?? ''}::${surface}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const lexemeId = await LinguisticService.lexemes.matchOrCreateByForm({
    form: surface,
    ...(lang ? { language: lang } : {}),
  });
  if (lexemeId) cache.set(cacheKey, lexemeId);
  return lexemeId;
}

async function persistImportedTokensForHost(input: {
  textId: string;
  hostUnitId: string;
  tokens: AdditionalTierToken[];
  now: string;
  language?: string;
  lexemeIdByFormKey: Map<string, string>;
}): Promise<void> {
  const tokenRows: UnitTokenDocType[] = [];
  const morphRows: UnitMorphemeDocType[] = [];
  for (const [tokenIndex, token] of input.tokens.entries()) {
    if (!token.form || typeof token.form !== 'object') continue;
    const tokenId = newId('tok');
    const tokenLexemeId = await resolveFormLexemeId(
      token.form,
      input.language,
      input.lexemeIdByFormKey,
    );
    tokenRows.push({
      id: tokenId,
      textId: input.textId,
      unitId: input.hostUnitId,
      form: token.form,
      ...(token.gloss ? { gloss: token.gloss } : {}),
      ...(token.pos ? { pos: token.pos } : {}),
      ...(tokenLexemeId ? { lexemeId: tokenLexemeId } : {}),
      tokenIndex,
      createdAt: input.now,
      updatedAt: input.now,
    });
    const morphemes = Array.isArray(token.morphemes) ? token.morphemes : [];
    for (const [morphemeIndex, morph] of morphemes.entries()) {
      if (!morph?.form || typeof morph.form !== 'object') continue;
      const morphLexemeId = await resolveFormLexemeId(
        morph.form,
        input.language,
        input.lexemeIdByFormKey,
      );
      morphRows.push({
        id: newId('morph'),
        textId: input.textId,
        unitId: input.hostUnitId,
        tokenId,
        form: morph.form,
        ...(morph.gloss ? { gloss: morph.gloss } : {}),
        ...(morph.pos ? { pos: morph.pos } : {}),
        ...(morphLexemeId ? { lexemeId: morphLexemeId } : {}),
        morphemeIndex,
        createdAt: input.now,
        updatedAt: input.now,
      });
    }
  }
  if (tokenRows.length > 0) await LinguisticService.units.saveTokensBatch(tokenRows);
  if (morphRows.length > 0) await LinguisticService.units.saveMorphemesBatch(morphRows);
  const linkRows: TokenLexemeLinkDocType[] = [];
  for (const token of tokenRows) {
    if (!token.lexemeId) continue;
    linkRows.push({
      id: newId('tll'),
      targetType: 'token',
      targetId: token.id,
      lexemeId: token.lexemeId,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
  for (const morph of morphRows) {
    if (!morph.lexemeId) continue;
    linkRows.push({
      id: newId('tll'),
      targetType: 'morpheme',
      targetId: morph.id,
      lexemeId: morph.lexemeId,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
  if (linkRows.length > 0) {
    const db = await getDb();
    await db.dexie.token_lexeme_links.bulkPut(linkRows);
  }
}

type InsertedUnit = {
  id: string;
  startTime: number;
  endTime: number;
  unit: LayerUnitDocType;
};

const log = createLogger('useImportExport.additionalTierHandlers');

export async function importAdditionalTiers(input: {
  db: JieyuDatabase;
  now: string;
  textId: string;
  mediaId?: string;
  layers: LayerDocType[];
  additionalTiers: Map<string, AdditionalTierAnnotation[]>;
  insertedUnits: InsertedUnit[];
  importedTierMetadata: Map<
    string,
    { languageId?: string; orthographyId?: string; bridgeId?: string }
  >;
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
    transcriptionTreeParentId?: string;
    preferredHostTranscriptionLayerId?: string;
    tierName?: string;
  }) => Promise<Array<{ layerId: string; text: string }>>;
  rememberLayer: (layer: LayerDocType) => void;
  lexemeIdByFormKey: Map<string, string>;
}) {
  let tierCount = 0;
  let skippedIndependentTierSegmentCount = 0;
  let droppedTranslationSegmentCount = 0;

  const existingTrcLayers = [
    ...input.layers.filter((layer) => layer.layerType === 'transcription'),
    ...(input.autoCreatedLayerKey && input.effectiveTranscriptionLayerId
      ? [{ key: input.autoCreatedLayerKey, id: input.effectiveTranscriptionLayerId }]
      : []),
  ];

  if (input.additionalTiers.size > 0 && existingTrcLayers.length === 0) {
    log.warn('skipped translation tier import: no transcription layer exists');
  }

  const existingTrlByName = new Map(
    input.layers
      .filter((layer) => layer.layerType === 'translation')
      .map((layer) => {
        const engName =
          typeof layer.name === 'object' && layer.name !== null
            ? ((layer.name as Record<string, string>).eng ?? '')
            : '';
        return [engName.toLocaleLowerCase('en'), layer] as const;
      })
      .filter(([name]) => name.length > 0),
  );

  const existingIndepTrcLayersByName = new Map<string, string>();
  for (const layer of input.layers) {
    if (layer.layerType === 'transcription' && layer.constraint === 'independent_boundary') {
      const engName =
        typeof layer.name === 'object' && layer.name !== null
          ? ((layer.name as Record<string, string>).eng ?? '')
          : '';
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
      existingIndepTrcLayersByName.get(tierName.toLocaleLowerCase('en')) ??
      existingIndepTrcLayersByName.get(humanizedTierForLookup);
    if (indepLayerId) {
      const firstUtt = input.insertedUnits[0];
      const importMediaId = input.mediaId ?? firstUtt?.unit.mediaId;
      const importTextId = firstUtt?.unit.textId ?? input.textId;
      if (!importMediaId) {
        skippedIndependentTierSegmentCount += annotations.filter((annotation) =>
          annotation.text.trim(),
        ).length;
        log.warn(
          'skipped independent transcription tier import: missing media, cannot restore segments',
          {
            tierName,
            layerId: indepLayerId,
            annotationCount: annotations.length,
          },
        );
        continue;
      }
      for (const annotation of annotations) {
        if (!annotation.text.trim()) continue;
        const annStart = Number(annotation.startTime.toFixed(3));
        const annEnd = Number(annotation.endTime.toFixed(3));
        // PointTier / TextTier import as zero-duration intervals (start === end); only skip inverted ranges.
        if (annEnd < annStart) continue;
        const writes = await input.planImportedWrites({
          text: annotation.text,
          ...(importedTierMeta?.orthographyId !== undefined
            ? { sourceOrthographyId: importedTierMeta.orthographyId }
            : {}),
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
              ...(annotation.annotationId ? { externalRef: annotation.annotationId } : {}),
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
          if (Array.isArray(annotation.tokens) && annotation.tokens.length > 0) {
            await persistImportedTokensForHost({
              textId: importTextId,
              hostUnitId: segId,
              tokens: annotation.tokens,
              now: segNow,
              language: importedTierMeta?.languageId ?? 'und',
              lexemeIdByFormKey: input.lexemeIdByFormKey,
            });
          }
        }
      }
      continue;
    }

    const tierLang =
      importedTierMeta?.languageId ??
      input.eafResult?.tierLocales?.get(tierName) ??
      input.glossLanguage ??
      'und';

    const humanizedName = humanizeTierName(tierName);
    const dbResolvedName =
      input.resolveDbLanguageName(tierName) ?? input.resolveDbLanguageName(tierLang);
    const existingMatch =
      existingTrlByName.get(tierName.toLocaleLowerCase('en')) ??
      existingTrlByName.get(humanizedName.toLocaleLowerCase('en')) ??
      (dbResolvedName ? existingTrlByName.get(dbResolvedName.toLocaleLowerCase('en')) : undefined);
    const eafTierConstraint = input.eafResult?.tierConstraints?.get(tierName);
    const importParentTierId = eafTierConstraint?.parentTierId;
    const importMappedHostLayerId = importParentTierId
      ? input.tierNameToLayerId.get(importParentTierId)
      : undefined;
    const importFallbackHostLayerId =
      eafTierConstraint && eafTierConstraint.constraint !== 'independent_boundary'
        ? (existingTrcLayers[existingTrcLayers.length - 1]?.id ??
          input.effectiveTranscriptionLayerId)
        : undefined;
    const importPreferredHostTranscriptionLayerId =
      importMappedHostLayerId ?? importFallbackHostLayerId;

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
      const eafTrlLangLabel =
        input.resolveEafLanguageLabel(tierLang) ?? input.resolveEafLanguageLabel(tierName);
      const key = input.eafResult
        ? withEafKeyMeta(baseKey, {
            externalTierId: tierName,
            ...(eafTrlLangLabel ? { langLabel: eafTrlLangLabel } : {}),
          })
        : baseKey;

      const newLayer: LayerDocType = {
        id: layerId,
        textId: input.textId,
        key,
        name: { eng: langLabel, zho: langLabel },
        layerType: 'translation' as const,
        languageId: tierLang,
        ...(importedTierMeta?.orthographyId
          ? { orthographyId: importedTierMeta.orthographyId }
          : {}),
        ...(importedTierBridgeId ? { bridgeId: importedTierBridgeId } : {}),
        modality: 'text' as const,
        acceptsAudio: false,
        sortOrder: tierCount + 1,
        ...(eafTierConstraint ? { constraint: eafTierConstraint.constraint } : {}),
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
        const isPreferred = Boolean(
          importPreferredHostTranscriptionLayerId &&
          transcriptionLayer.id === importPreferredHostTranscriptionLayerId,
        );
        await input.db.collections.layer_links.insert({
          id: newId('link'),
          transcriptionLayerKey: transcriptionLayer.key,
          hostTranscriptionLayerId: transcriptionLayer.id,
          layerId,
          linkType: 'free',
          isPreferred,
          createdAt: input.now,
        });
      }
    }

    const translationBaseLabel =
      existingMatch && typeof existingMatch.name === 'object' && existingMatch.name !== null
        ? ((existingMatch.name as Record<string, string>).zho ??
          (existingMatch.name as Record<string, string>).eng ??
          humanizedName)
        : humanizedName;

    const translationConstraint = eafTierConstraint?.constraint ?? existingMatch?.constraint;
    if (translationConstraint === 'independent_boundary') {
      const firstUtt = input.insertedUnits[0];
      const importMediaId = input.mediaId ?? firstUtt?.unit.mediaId;
      const importTextId = firstUtt?.unit.textId ?? input.textId;
      if (!importMediaId) {
        droppedTranslationSegmentCount += annotations.filter((annotation) =>
          annotation.text.trim(),
        ).length;
        log.warn(
          'skipped independent-boundary translation tier import: missing media, cannot restore segments',
          { tierName, layerId, annotationCount: annotations.length },
        );
        continue;
      }

      for (const annotation of annotations) {
        if (!annotation.text.trim()) continue;
        const annStart = Number(annotation.startTime.toFixed(3));
        const annEnd = Number(annotation.endTime.toFixed(3));
        if (annEnd < annStart) continue;
        const parentMatch = input.insertedUnits.find(
          (unit) => annStart >= unit.startTime - 0.05 && annEnd <= unit.endTime + 0.05,
        );
        if (!parentMatch) {
          droppedTranslationSegmentCount += 1;
          continue;
        }
        const preferredHostForWrites = existingMatch
          ? ((await resolvePreferredHostTranscriptionLayerIdForTranslationImport(
              input.db,
              existingMatch.id,
            )) ?? importPreferredHostTranscriptionLayerId)
          : importPreferredHostTranscriptionLayerId;
        const writes = await input.planImportedWrites({
          text: annotation.text,
          ...(importedTierMeta?.orthographyId !== undefined
            ? { sourceOrthographyId: importedTierMeta.orthographyId }
            : {}),
          ...(importedTierBridgeId !== undefined ? { bridgeId: importedTierBridgeId } : {}),
          targetLayerId: layerId,
          baseLabel: translationBaseLabel,
          languageId: tierLang,
          layerType: 'translation',
          keyPrefix: 'trl_import_source',
          constraint: 'independent_boundary',
          ...(preferredHostForWrites
            ? { preferredHostTranscriptionLayerId: preferredHostForWrites }
            : {}),
          tierName,
        });
        const segNow = new Date().toISOString();
        for (const write of writes) {
          const segId = newId('seg');
          await LayerSegmentationV2Service.createSegment({
            id: segId,
            textId: importTextId,
            mediaId: importMediaId,
            layerId: write.layerId,
            unitId: parentMatch.id,
            startTime: annStart,
            endTime: annEnd,
            createdAt: segNow,
            updatedAt: segNow,
          });
          await LayerUnitSegmentWriteService.insertSegmentContents(input.db, [
            {
              id: newId('utr'),
              textId: importTextId,
              unitId: parentMatch.id,
              layerId: write.layerId,
              modality: 'text',
              text: write.text,
              sourceType: 'human',
              ...(annotation.annotationId ? { externalRef: annotation.annotationId } : {}),
              createdAt: segNow,
              updatedAt: segNow,
            },
          ]);
          if (Array.isArray(annotation.tokens) && annotation.tokens.length > 0) {
            await persistImportedTokensForHost({
              textId: importTextId,
              hostUnitId: parentMatch.id,
              tokens: annotation.tokens,
              now: segNow,
              language: tierLang,
              lexemeIdByFormKey: input.lexemeIdByFormKey,
            });
          }
        }
      }
      continue;
    }

    for (const annotation of annotations) {
      if (!annotation.text.trim()) continue;
      const annStart = Number(annotation.startTime.toFixed(3));
      const annEnd = Number(annotation.endTime.toFixed(3));
      const match = input.insertedUnits.find(
        (unit) =>
          Math.abs(unit.startTime - annStart) < 0.05 && Math.abs(unit.endTime - annEnd) < 0.05,
      );
      if (!match) {
        droppedTranslationSegmentCount += 1;
        continue;
      }
      const preferredHostForWrites = existingMatch
        ? ((await resolvePreferredHostTranscriptionLayerIdForTranslationImport(
            input.db,
            existingMatch.id,
          )) ?? importPreferredHostTranscriptionLayerId)
        : importPreferredHostTranscriptionLayerId;
      const writes = await input.planImportedWrites({
        text: annotation.text,
        ...(importedTierMeta?.orthographyId !== undefined
          ? { sourceOrthographyId: importedTierMeta.orthographyId }
          : {}),
        ...(importedTierBridgeId !== undefined ? { bridgeId: importedTierBridgeId } : {}),
        targetLayerId: layerId,
        baseLabel: translationBaseLabel,
        languageId: tierLang,
        layerType: 'translation',
        keyPrefix: 'trl_import_source',
        ...(input.eafResult?.tierConstraints?.get(tierName)?.constraint
          ? { constraint: input.eafResult.tierConstraints.get(tierName)?.constraint }
          : {}),
        ...(preferredHostForWrites
          ? { preferredHostTranscriptionLayerId: preferredHostForWrites }
          : {}),
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
        if (Array.isArray(annotation.tokens) && annotation.tokens.length > 0) {
          await persistImportedTokensForHost({
            textId: match.unit.textId ?? input.textId,
            hostUnitId: match.id,
            tokens: annotation.tokens,
            now: input.now,
            language: tierLang,
            lexemeIdByFormKey: input.lexemeIdByFormKey,
          });
        }
      }
    }
  }

  return {
    tierCount,
    skippedIndependentTierSegmentCount,
    droppedTranslationSegmentCount,
  };
}
