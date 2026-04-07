import type { Dispatch, SetStateAction } from 'react';
import type {
  LayerDocType,
  MediaItemDocType,
  UtteranceTextDocType,
} from '../db';
import type { SaveState } from './useTranscriptionData';
import { getDb } from '../db';
import { LinguisticService } from '../services/LinguisticService';
import { validateLayerTierConsistency } from '../services/TierBridgeService';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
import { repairExistingLayerConstraints, validateExistingLayerConstraints } from '../services/LayerConstraintService';
import { importFromEaf, type EafImportResult } from '../services/EafService';
import { ingestTextFile } from '../utils/textIngestion';
import { importFromTextGrid, type TextGridImportResult } from '../services/TextGridService';
import { importFromTrs } from '../services/TranscriberService';
import { importFromFlextext } from '../services/FlexService';
import { importFromToolbox } from '../services/ToolboxService';
import { t, tf, type Locale } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import { buildPrimaryAndEnglishLabels, readAnyMultiLangLabel } from '../utils/multiLangLabels';
import { newId, humanizeTierName } from '../utils/transcriptionFormatters';
import { createLogger } from '../observability/logger';
import { toErrorMessage } from '../utils/saveStateError';
import { reportActionError } from '../utils/actionErrorReporter';
import { syncUtteranceTextToSegmentationV2 } from '../services/LayerSegmentationTextService';
import { loadOrthographyRuntime } from '../utils/loadOrthographyRuntime';
import { importAdditionalTiers } from './useImportExport.additionalTierHandlers';
import {
  DEFAULT_ANNOTATION_IMPORT_BRIDGE_STRATEGY,
  shouldWriteOriginalSourceText,
  shouldWriteBridgedTargetText,
  type AnnotationImportBridgeStrategy,
} from './useImportExport.annotationImport';
import {
  buildImportLanguageNameMap,
  createImportLanguageResolvers,
  createImportSpeakerResolver,
  withEafKeyMeta,
  writeImportLayerNameAudit,
} from './useImportExport.importHelpers';

const log = createLogger('useImportExport');

type UseImportExportImportHandlersInput = {
  activeTextId: string | null;
  getActiveTextId: () => Promise<string | null>;
  selectedUtteranceMedia: MediaItemDocType | undefined;
  layers: LayerDocType[];
  defaultTranscriptionLayerId: string | undefined;
  loadSnapshot: () => Promise<void>;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  locale: Locale;
  normalizeSpeakerLookupKey: (value: string | undefined) => string;
};

export function createImportExportImportHandlers(input: UseImportExportImportHandlersInput) {
  const {
    activeTextId,
    getActiveTextId,
    selectedUtteranceMedia,
    layers,
    defaultTranscriptionLayerId,
    loadSnapshot,
    setSaveState,
    locale,
    normalizeSpeakerLookupKey,
  } = input;

  const handleImportFile = async (
    file: File,
    importWriteStrategy: AnnotationImportBridgeStrategy = DEFAULT_ANNOTATION_IMPORT_BRIDGE_STRATEGY,
  ) => {
    const name = file.name.toLowerCase();
    const isJieyuArchive = name.endsWith('.jym') || name.endsWith('.jyt');
    if (isJieyuArchive) {
      const { createImportExportArchiveHandlers } = await import('./useImportExport.archiveHandlers');
      const { importProjectArchive } = createImportExportArchiveHandlers({
        activeTextId,
        loadSnapshot,
        locale,
        setSaveState,
      });
      await importProjectArchive(file, 'replace-all');
      return;
    }
    let text = '';
    let resolvedTextId: string | null = activeTextId;

    try {
      const xmlExts = ['.eaf', '.trs', '.flextext'];
      const isXml = xmlExts.some(ext => name.endsWith(ext));
      const ingested = await ingestTextFile(file, { xmlMode: isXml });
      text = ingested.text;

      let eafResult: EafImportResult | null = null;
      let tgResult: TextGridImportResult | null = null;
      let trsResult: ReturnType<typeof importFromTrs> | null = null;
      let flexResult: ReturnType<typeof importFromFlextext> | null = null;
      let toolboxResult: ReturnType<typeof importFromToolbox> | null = null;

      if (name.endsWith('.eaf')) {
        eafResult = importFromEaf(text);
      } else if (name.endsWith('.textgrid')) {
        tgResult = importFromTextGrid(text);
      } else if (name.endsWith('.trs')) {
        trsResult = importFromTrs(text);
      } else if (name.endsWith('.flextext')) {
        flexResult = importFromFlextext(text);
      } else if (name.endsWith('.toolbox') || name.endsWith('.txt')) {
        toolboxResult = importFromToolbox(text);
      } else {
        setSaveState({ kind: 'error', message: t(locale, 'transcription.importExport.unsupportedFormat') });
        return;
      }

      const parsedUtterances = eafResult?.utterances
        ?? tgResult?.utterances
        ?? trsResult?.utterances
        ?? flexResult?.utterances
        ?? toolboxResult?.utterances
        ?? [];

      const additionalTiers: Map<string, Array<{ startTime: number; endTime: number; text: string }>> =
        eafResult?.translationTiers
        ?? tgResult?.additionalTiers
        ?? toolboxResult?.additionalTiers
        ?? new Map();

      if (flexResult && flexResult.phraseGlosses.size > 0) {
        const phraseGlossValues = Array.from(flexResult.phraseGlosses.values());
        const glossSegments = flexResult.utterances
          .map((u, i) => ({ startTime: u.startTime, endTime: u.endTime, text: phraseGlossValues[i] ?? '' }))
          .filter((s) => s.text.trim() !== '');
        if (glossSegments.length > 0) additionalTiers.set('FLEx Gloss', glossSegments);
      }

      const textId = activeTextId ?? (await getActiveTextId());
      resolvedTextId = textId;
      if (!textId) { setSaveState({ kind: 'error', message: t(locale, 'transcription.importExport.noProject') }); return; }
      const importTextId = textId;
      let mediaId = selectedUtteranceMedia?.id;

      if (!mediaId && eafResult && eafResult.mediaFilename && eafResult.mediaFilename !== 'unknown.wav') {
        const { mediaId: newMediaId } = await LinguisticService.importAudio({
          textId,
          audioBlob: new Blob([], { type: 'audio/wav' }),
          filename: eafResult.mediaFilename,
          duration: 0,
        });
        mediaId = newMediaId;
      }

      const db = await getDb();
      const now = new Date().toISOString();
      const layersAfterImport: LayerDocType[] = [...layers];
      const layerById = new Map(layersAfterImport.map((layer) => [layer.id, layer] as const));

      function rememberLayer(layer: LayerDocType): void {
        layersAfterImport.push(layer);
        layerById.set(layer.id, layer);
      }

      function resolveLayerNameText(name: LayerDocType['name']): string {
        return readAnyMultiLangLabel(name) ?? '';
      }

      function buildSourcePreservationLayerName(baseLabel: string): LayerDocType['name'] {
        const trimmed = baseLabel.trim() || 'Imported';
        return buildPrimaryAndEnglishLabels({
          primaryLabel: `${trimmed}（${t('zh-CN', 'transcription.importExport.sourcePreservationLayerSuffix')}）`,
          englishFallbackLabel: `${trimmed} (${t('en-US', 'transcription.importExport.sourcePreservationLayerSuffix')})`,
        });
      }

      async function transformImportedTextToTarget(inputData: {
        text: string;
        sourceOrthographyId?: string;
        targetLayerId?: string;
        bridgeId?: string;
      }): Promise<string> {
        const targetOrthographyId = inputData.targetLayerId
          ? layerById.get(inputData.targetLayerId)?.orthographyId?.trim()
          : undefined;
        if (!inputData.text || !targetOrthographyId) {
          return inputData.text;
        }
        const { applyOrthographyBridgeIfNeeded } = await loadOrthographyRuntime();
        return (await applyOrthographyBridgeIfNeeded({
          text: inputData.text,
          ...(inputData.sourceOrthographyId !== undefined ? { sourceOrthographyId: inputData.sourceOrthographyId } : {}),
          targetOrthographyId,
          ...(inputData.bridgeId !== undefined ? { bridgeId: inputData.bridgeId } : {}),
        })).text;
      }

      async function ensureSourcePreservationLayer(inputData: {
        targetLayerId?: string;
        baseLabel: string;
        languageId: string;
        sourceOrthographyId?: string;
        layerType: LayerDocType['layerType'];
        keyPrefix: string;
        constraint?: LayerDocType['constraint'];
        parentLayerId?: string;
        tierName?: string;
      }): Promise<string | undefined> {
        const sourceOrthographyId = inputData.sourceOrthographyId?.trim();
        const targetLayer = inputData.targetLayerId ? layerById.get(inputData.targetLayerId) : undefined;
        const targetOrthographyId = targetLayer?.orthographyId?.trim();
        if (!sourceOrthographyId || !targetLayer || !targetOrthographyId || sourceOrthographyId === targetOrthographyId) {
          return inputData.targetLayerId;
        }

        const desiredName = buildSourcePreservationLayerName(inputData.baseLabel);
        const existingLayer = layersAfterImport.find((layer) => {
          if (layer.layerType !== inputData.layerType) return false;
          if ((layer.parentLayerId ?? '') !== (inputData.parentLayerId ?? '')) return false;
          if ((layer.constraint ?? '') !== (inputData.constraint ?? '')) return false;
          if (layer.languageId !== inputData.languageId) return false;
          if ((layer.orthographyId?.trim() ?? '') !== sourceOrthographyId) return false;
          return resolveLayerNameText(layer.name) === resolveLayerNameText(desiredName);
        });
        if (existingLayer) return existingLayer.id;

        const layerId = newId('layer');
        const newLayer: LayerDocType = {
          id: layerId,
          textId: importTextId,
          key: `${inputData.keyPrefix}_${Math.random().toString(36).slice(2, 7)}`,
          name: desiredName,
          layerType: inputData.layerType,
          languageId: inputData.languageId,
          orthographyId: sourceOrthographyId,
          modality: 'text',
          acceptsAudio: false,
          sortOrder: layersAfterImport.length + 1,
          ...(inputData.constraint ? { constraint: inputData.constraint } : {}),
          ...(inputData.parentLayerId ? { parentLayerId: inputData.parentLayerId } : {}),
          createdAt: now,
          updatedAt: now,
        };
        await LayerTierUnifiedService.createLayer(newLayer);
        rememberLayer(newLayer);
        await writeImportLayerNameAudit({
          db,
          now,
          layerId,
          displayName: resolveLayerNameText(desiredName),
          source: 'fallback',
          languageId: inputData.languageId,
          ...(inputData.tierName ? { tierName: inputData.tierName } : {}),
        });
        return layerId;
      }

      async function planImportedWrites(inputData: {
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
      }): Promise<Array<{ layerId: string; text: string }>> {
        const targetLayerId = inputData.targetLayerId?.trim();
        if (!targetLayerId || !inputData.text.trim()) return [];

        const targetLayer = layerById.get(targetLayerId);
        const sourceOrthographyId = inputData.sourceOrthographyId?.trim();
        const targetOrthographyId = targetLayer?.orthographyId?.trim();
        const needsSeparateSourceLayer = Boolean(
          targetLayer && sourceOrthographyId && targetOrthographyId && sourceOrthographyId !== targetOrthographyId,
        );
        const writes: Array<{ layerId: string; text: string }> = [];

        if (shouldWriteOriginalSourceText(importWriteStrategy)) {
          const sourceLayerId = needsSeparateSourceLayer
            ? await ensureSourcePreservationLayer({
              targetLayerId,
              baseLabel: inputData.baseLabel,
              languageId: inputData.languageId,
              ...(sourceOrthographyId !== undefined ? { sourceOrthographyId } : {}),
              layerType: inputData.layerType,
              keyPrefix: inputData.keyPrefix,
              ...(inputData.constraint ? { constraint: inputData.constraint } : {}),
              ...(inputData.parentLayerId ? { parentLayerId: inputData.parentLayerId } : {}),
              ...(inputData.tierName ? { tierName: inputData.tierName } : {}),
            })
            : targetLayerId;
          if (sourceLayerId) {
            writes.push({ layerId: sourceLayerId, text: inputData.text });
          }
        }

        if (shouldWriteBridgedTargetText(importWriteStrategy)) {
          const transformedText = await transformImportedTextToTarget({
            text: inputData.text,
            ...(sourceOrthographyId !== undefined ? { sourceOrthographyId } : {}),
            targetLayerId,
            ...(inputData.bridgeId !== undefined ? { bridgeId: inputData.bridgeId } : {}),
          });
          writes.push({ layerId: targetLayerId, text: transformedText });
        }

        return Array.from(new Map(writes.map((item) => [item.layerId, item])).values());
      }

      const languageNameByIso = await buildImportLanguageNameMap(db);
      const {
        resolveDbLanguageName,
        resolveEafLanguageLabel,
        resolveLayerDisplayName,
      } = createImportLanguageResolvers({
        languageNameByIso,
        ...(eafResult ? { eafLanguageLabels: eafResult.languageLabels } : {}),
      });
      const { speakerIdMap, resolveOrCreateSpeaker } = await createImportSpeakerResolver({
        normalizeSpeakerLookupKey,
      });

      if (eafResult && eafResult.participants.length > 0) {
        for (const speakerName of eafResult.participants) {
          await resolveOrCreateSpeaker(speakerName, speakerName);
        }
      } else if (trsResult && trsResult.speakers.length > 0) {
        for (const trsSpeaker of trsResult.speakers) {
          await resolveOrCreateSpeaker(trsSpeaker.id, trsSpeaker.name);
        }
      }

      let effectiveTranscriptionLayerId = defaultTranscriptionLayerId;
      let autoCreatedLayerKey: string | undefined;

      const importedTrcName = eafResult?.transcriptionTierName
        ?? tgResult?.transcriptionTierName
        ?? undefined;
      const importedTierMetadata = eafResult?.tierMetadata
        ?? tgResult?.tierMetadata
        ?? new Map<string, { languageId?: string; orthographyId?: string; bridgeId?: string }>();
      const importedTranscriptionMeta = importedTrcName
        ? importedTierMetadata.get(importedTrcName)
        : undefined;
      const importedTranscriptionBridgeId = importedTranscriptionMeta?.bridgeId
        ?? undefined;
      const inferredTranscriptionLang = importedTranscriptionMeta?.languageId
        ?? eafResult?.defaultLocale
        ?? flexResult?.sourceLanguage
        ?? trsResult?.speakers?.[0]?.lang
        ?? 'und';

      const tierNameToLayerId = new Map<string, string>();

      if (parsedUtterances.some((u) => u.transcription.trim())) {
        const existingTrc = layers.filter((l) => l.layerType === 'transcription');
        {
          const dedupCandidates = new Set<string>();
          if (importedTrcName) {
            dedupCandidates.add(importedTrcName.toLocaleLowerCase('en'));
            dedupCandidates.add(humanizeTierName(importedTrcName).toLocaleLowerCase('en'));
            const dbResolvedByTierName = resolveDbLanguageName(importedTrcName);
            if (dbResolvedByTierName) dedupCandidates.add(dbResolvedByTierName.toLocaleLowerCase('en'));
          }
          const dbResolvedByLang = resolveDbLanguageName(inferredTranscriptionLang);
          if (dbResolvedByLang) dedupCandidates.add(dbResolvedByLang.toLocaleLowerCase('en'));

          const nameMatch = existingTrc.find((l) => {
            const eng = typeof l.name === 'object' && l.name !== null ? (l.name as Record<string, string>).eng ?? '' : '';
            return dedupCandidates.has(eng.toLocaleLowerCase('en'));
          });
          if (nameMatch) {
            effectiveTranscriptionLayerId = nameMatch.id;
          }
        }

        if (!effectiveTranscriptionLayerId) {
          const trcDisplayName = resolveLayerDisplayName(
            [inferredTranscriptionLang, importedTrcName],
            humanizeTierName(importedTrcName ?? 'Transcription'),
          );
          const displayName = trcDisplayName.label;
          const autoLayerId = newId('layer');
          const baseTrcKey = `trc_import_${Math.random().toString(36).slice(2, 7)}`;
          const eafTrcLangLabel = resolveEafLanguageLabel(inferredTranscriptionLang)
            ?? resolveEafLanguageLabel(importedTrcName);
          autoCreatedLayerKey = eafResult
            ? withEafKeyMeta(baseTrcKey, {
              ...(importedTrcName ? { externalTierId: importedTrcName } : {}),
              ...(eafTrcLangLabel ? { langLabel: eafTrcLangLabel } : {}),
            })
            : baseTrcKey;
          const eafTrcConstraint = importedTrcName ? eafResult?.tierConstraints?.get(importedTrcName) : undefined;
          const autoCreatedLayerDoc: LayerDocType = {
            id: autoLayerId,
            textId,
            key: autoCreatedLayerKey,
            name: { eng: displayName, zho: displayName },
            layerType: 'transcription' as const,
            languageId: inferredTranscriptionLang,
            ...(importedTranscriptionMeta?.orthographyId ? { orthographyId: importedTranscriptionMeta.orthographyId } : {}),
            ...(importedTranscriptionBridgeId
              ? { bridgeId: importedTranscriptionBridgeId }
              : {}),
            modality: 'text' as const,
            acceptsAudio: false,
            sortOrder: 0,
            ...(eafTrcConstraint ? { constraint: eafTrcConstraint.constraint } : {}),
            createdAt: now,
            updatedAt: now,
          };
          await LayerTierUnifiedService.createLayer(autoCreatedLayerDoc);
          rememberLayer(autoCreatedLayerDoc);
          tierNameToLayerId.set(importedTrcName ?? 'transcription', autoLayerId);
          await writeImportLayerNameAudit({
            db,
            now,
            layerId: autoLayerId,
            displayName,
            source: trcDisplayName.source,
            languageId: inferredTranscriptionLang,
            ...(importedTrcName ? { tierName: importedTrcName } : {}),
            ...(trcDisplayName.matchedTag ? { matchedTag: trcDisplayName.matchedTag } : {}),
          });
          effectiveTranscriptionLayerId = autoLayerId;
        }

        if (effectiveTranscriptionLayerId && importedTrcName && !tierNameToLayerId.has(importedTrcName)) {
          tierNameToLayerId.set(importedTrcName, effectiveTranscriptionLayerId);
        }
      }

      const insertedUtterances: Array<{ id: string; startTime: number; endTime: number; utterance: import('../db').UtteranceDocType }> = [];
      for (const u of parsedUtterances) {
        const id = newId('utt');
        const startTime = Number(u.startTime.toFixed(3));
        const endTime = Number(u.endTime.toFixed(3));
        const maybeTokens = 'tokens' in u ? (u as { tokens?: unknown }).tokens : undefined;
        const maybeSpeakerId = 'speakerId' in u ? (u as { speakerId?: unknown }).speakerId : undefined;
        const maybeAnnotationId = ('annotationId' in u && typeof (u as { annotationId?: string }).annotationId === 'string')
          ? (u as { annotationId: string }).annotationId
          : undefined;
        const normalizedSpeakerKey = typeof maybeSpeakerId === 'string'
          ? normalizeSpeakerLookupKey(maybeSpeakerId)
          : '';
        const resolvedSpeakerId = typeof maybeSpeakerId === 'string' && maybeSpeakerId.length > 0
          ? speakerIdMap.get(normalizedSpeakerKey) ?? maybeSpeakerId.trim()
          : undefined;
        const newUtterance: import('../db').UtteranceDocType = {
          id,
          textId,
          ...(mediaId ? { mediaId } : {}),
          startTime,
          endTime,
          annotationStatus: 'raw',
          ...(resolvedSpeakerId ? { speakerId: resolvedSpeakerId } : {}),
          createdAt: now,
          updatedAt: now,
        };
        await LinguisticService.saveUtterance(newUtterance);

        if (Array.isArray(maybeTokens) && maybeTokens.length > 0) {
          const tokenRows: import('../db').UtteranceTokenDocType[] = [];
          const morphRows: import('../db').UtteranceMorphemeDocType[] = [];

          maybeTokens.forEach((rawToken, tokenIndex) => {
            if (!rawToken || typeof rawToken !== 'object') return;
            const token = rawToken as {
              form?: Record<string, string>;
              gloss?: Record<string, string>;
              pos?: string;
              morphemes?: Array<{
                form?: Record<string, string>;
                gloss?: Record<string, string>;
                pos?: string;
              }>;
            };
            const tokenId = newId('tok');
            if (!token.form || typeof token.form !== 'object') return;

            tokenRows.push({
              id: tokenId,
              textId,
              utteranceId: id,
              form: token.form,
              ...(token.gloss ? { gloss: token.gloss } : {}),
              ...(token.pos ? { pos: token.pos } : {}),
              tokenIndex,
              createdAt: now,
              updatedAt: now,
            });

            const morphemes = Array.isArray(token.morphemes) ? token.morphemes : [];
            morphemes.forEach((morph, morphemeIndex) => {
              if (!morph?.form || typeof morph.form !== 'object') return;
              morphRows.push({
                id: newId('morph'),
                textId,
                utteranceId: id,
                tokenId,
                form: morph.form,
                ...(morph.gloss ? { gloss: morph.gloss } : {}),
                ...(morph.pos ? { pos: morph.pos } : {}),
                morphemeIndex,
                createdAt: now,
                updatedAt: now,
              });
            });
          });

          if (tokenRows.length > 0) {
            await LinguisticService.saveTokensBatch(tokenRows);
          }
          if (morphRows.length > 0) {
            await LinguisticService.saveMorphemesBatch(morphRows);
          }
        }
        insertedUtterances.push({ id, startTime, endTime, utterance: newUtterance });

        if (u.transcription.trim() && effectiveTranscriptionLayerId) {
          const transcriptionWrites = await planImportedWrites({
            text: u.transcription,
            ...(importedTranscriptionMeta?.orthographyId !== undefined ? { sourceOrthographyId: importedTranscriptionMeta.orthographyId } : {}),
            ...(importedTranscriptionBridgeId !== undefined ? { bridgeId: importedTranscriptionBridgeId } : {}),
            targetLayerId: effectiveTranscriptionLayerId,
            baseLabel: resolveLayerDisplayName(
              [inferredTranscriptionLang, importedTrcName],
              humanizeTierName(importedTrcName ?? 'Transcription'),
            ).label,
            languageId: inferredTranscriptionLang,
            layerType: 'transcription',
            keyPrefix: 'trc_import_source',
            ...(importedTrcName ? { tierName: importedTrcName } : {}),
          });
          for (const write of transcriptionWrites) {
            const doc: UtteranceTextDocType = {
              id: newId('utr'),
              utteranceId: id,
              layerId: write.layerId,
              modality: 'text' as const,
              text: write.text,
              sourceType: 'human' as const,
              ...(maybeAnnotationId ? { externalRef: maybeAnnotationId } : {}),
              createdAt: now,
              updatedAt: now,
            };
            await syncUtteranceTextToSegmentationV2(db, newUtterance, doc);
          }
        }
      }

      const { tierCount, skippedIndependentTierSegmentCount } = await importAdditionalTiers({
        db,
        now,
        textId,
        ...(mediaId ? { mediaId } : {}),
        layers,
        additionalTiers,
        insertedUtterances,
        importedTierMetadata,
        tierNameToLayerId,
        ...(effectiveTranscriptionLayerId ? { effectiveTranscriptionLayerId } : {}),
        ...(autoCreatedLayerKey ? { autoCreatedLayerKey } : {}),
        eafResult,
        ...(flexResult?.glossLanguage ? { glossLanguage: flexResult.glossLanguage } : {}),
        resolveDbLanguageName,
        resolveEafLanguageLabel,
        resolveLayerDisplayName,
        planImportedWrites,
        rememberLayer,
      });

      fireAndForget(
        validateLayerTierConsistency(textId).then((issues) => {
          if (issues.length > 0) {
            console.warn('[TierBridge] Post-import consistency issues:', issues);
          }
        }),
      );

      const repairedResult = repairExistingLayerConstraints(layersAfterImport);
      const originalLayerById = new Map(layersAfterImport.map((layer) => [layer.id, layer] as const));
      const changedLayers = repairedResult.layers.filter((layer) => {
        const before = originalLayerById.get(layer.id);
        if (!before) return false;
        const beforeConstraint = before.constraint ?? (before.layerType === 'translation' ? 'symbolic_association' : 'independent_boundary');
        const afterConstraint = layer.constraint ?? (layer.layerType === 'translation' ? 'symbolic_association' : 'independent_boundary');
        return beforeConstraint !== afterConstraint || (before.parentLayerId ?? '') !== (layer.parentLayerId ?? '');
      });
      for (const changedLayer of changedLayers) {
        await LayerTierUnifiedService.updateLayer({
          ...changedLayer,
          updatedAt: now,
        });
      }
      const layerConstraintIssues = validateExistingLayerConstraints(repairedResult.layers);
      if (layerConstraintIssues.length > 0) {
        console.warn('[Import] Layer constraint validation found issues', layerConstraintIssues);
      }
      await loadSnapshot();
      const importDoneMessage = tierCount > 0
        ? tf(locale, 'transcription.importExport.importDone.segmentsWithLayers', {
          count: parsedUtterances.length,
          layers: tierCount,
        })
        : tf(locale, 'transcription.importExport.importDone.segments', {
          count: parsedUtterances.length,
        });
      setSaveState({
        kind: 'done',
        message: [
          importDoneMessage,
          ...(skippedIndependentTierSegmentCount > 0
            ? [tf(locale, 'transcription.importExport.importDone.independentSegmentsSkippedNoMedia', {
              count: skippedIndependentTierSegmentCount,
            })]
            : []),
          ...(repairedResult.repairs.length > 0
            ? [tf(locale, 'transcription.importExport.importDone.constraintRepaired', {
              count: repairedResult.repairs.length,
            })]
            : []),
          ...(layerConstraintIssues.length > 0
            ? [tf(locale, 'transcription.importExport.importDone.constraintWarning', {
              count: layerConstraintIssues.length,
            })]
            : []),
        ].join(' '),
      });
    } catch (err) {
      const rawMessage = toErrorMessage(err);
      log.error('Import file failed', {
        fileName: file.name,
        isArchive: isJieyuArchive,
        resolvedTextId,
        error: rawMessage,
      });
      reportActionError({
        actionLabel: t(locale, 'transcription.importExport.actionLabelImportFile'),
        error: err,
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        conflictNames: [
          'TranscriptionPersistenceConflictError',
          'RecoveryApplyConflictError',
        ],
        conflictI18nKey: 'transcription.importExport.conflict',
        fallbackI18nKey: 'transcription.importExport.failed',
        conflictMessage: t(locale, 'transcription.importExport.conflict'),
        fallbackMessage: tf(locale, 'transcription.importExport.failed', {
          message: rawMessage,
        }),
      });
    }
  };

  return {
    handleImportFile,
  };
}
