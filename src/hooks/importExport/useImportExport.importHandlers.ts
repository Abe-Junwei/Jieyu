import type { Dispatch, SetStateAction } from 'react';
import type {
  LayerDocType,
  LayerLinkDocType,
  MediaItemDocType,
  LayerUnitContentDocType,
} from '../../db';
import type { SaveState } from '../useTranscriptionData';
import { dexieStoresForAnnotationImportRw, getDb, withTransaction } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { validateLayerTierConsistency } from '../../services/TierBridgeService';
import { LayerTierUnifiedService } from '../../services/LayerTierUnifiedService';
import {
  hasRepairPersistableLayerDiff,
  repairExistingLayerConstraints,
  validateExistingLayerConstraints,
} from '../../services/LayerConstraintService';
import { importFromEaf, type EafImportResult } from '../../services/EafService';
import { ingestTextFile } from '../../utils/textIngestion';
import { importFromTextGrid, type TextGridImportResult } from '../../services/TextGridService';
import { importFromTrs } from '../../services/TranscriberService';
import { importFromFlextext } from '../../services/FlexService';
import { importFromToolbox } from '../../services/ToolboxService';
import { t, tf, type Locale } from '../../i18n';
import { fireAndForget } from '../../utils/fireAndForget';
import { buildPrimaryAndEnglishLabels, readAnyMultiLangLabel } from '../../utils/multiLangLabels';
import { newId, humanizeTierName } from '../../utils/transcriptionFormatters';
import { createLogger } from '../../observability/logger';
import { toErrorMessage } from '../../utils/saveStateError';
import { reportActionError } from '../../utils/actionErrorReporter';
import { mergeImportedTimelineMetadata } from '../../utils/timelineBindingExtent';
import { assessAnnotationImportMismatch } from '../../utils/timelineImportMismatch';
import {
  resolveEstablishedAcousticDurationSec,
  resolveEstablishedDocumentSpanSec,
  resolveImportedUnitsMaxEndSec,
} from '../../utils/timelineImportSpanCaps';
import { ImportMismatchRequiresAckError } from '../../utils/timelineImportMismatchAckError';
import { resolvePostImportLogicalExpandTargetSec } from '../../utils/timelineImportPostApply';
import { LayerSegmentQueryService } from '../../services/LayerSegmentQueryService';
import { syncUnitTextToSegmentationV2 } from '../../services/LayerSegmentationTextService';
import { loadOrthographyRuntime } from '../../utils/loadOrthographyRuntime';
import { normalizeUserNoteDocForStorage } from '../../utils/camDataUtils';
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
  resolvePreferredHostTranscriptionLayerIdForTranslationImport,
  withEafKeyMeta,
  writeImportLayerNameAudit,
} from './useImportExport.importHelpers';
import {
  getLayerTreeParentLayerId,
  layerDocPatchWithTreeParent,
} from './useImportExport.layerTreeParentField';

const log = createLogger('useImportExport');

export type ImportExportImportHandlerOptions = {
  mismatchAcknowledged?: boolean;
};

type UseImportExportImportHandlersInput = {
  activeTextId: string | null;
  getActiveTextId: () => Promise<string | null>;
  selectedUnitMedia: MediaItemDocType | undefined;
  /** 时间轴解析媒体；在 `segmentScopeMediaId` 之后、`selectedUnitMedia` 之前参与默认 mediaId。 */
  activeTimelineMediaItem?: MediaItemDocType | undefined;
  /** 与转写页 `resolveSegmentScopeMediaId` 同源，供导入写库选 media。 */
  segmentScopeMediaId?: string | undefined;
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
    selectedUnitMedia,
    activeTimelineMediaItem,
    segmentScopeMediaId,
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
    importOptions?: ImportExportImportHandlerOptions,
  ) => {
    const name = file.name.toLowerCase();
    const isJieyuArchive = name.endsWith('.jym') || name.endsWith('.jyt');
    if (isJieyuArchive) {
      const { createImportExportArchiveHandlers } =
        await import('./useImportExport.archiveHandlers');
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
      const isXml = xmlExts.some((ext) => name.endsWith(ext));
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
        setSaveState({
          kind: 'error',
          message: t(locale, 'transcription.importExport.unsupportedFormat'),
        });
        return;
      }

      const parsedUnits =
        eafResult?.units ??
        tgResult?.units ??
        trsResult?.units ??
        flexResult?.units ??
        toolboxResult?.units ??
        [];

      const importedTimelineMetadata =
        eafResult?.timelineMetadata ??
        tgResult?.timelineMetadata ??
        trsResult?.timelineMetadata ??
        flexResult?.timelineMetadata ??
        toolboxResult?.timelineMetadata;

      const additionalTiers: Map<
        string,
        Array<{
          startTime: number;
          endTime: number;
          text: string;
          annotationId?: string;
          tokens?: Array<{
            form: Record<string, string>;
            gloss?: Record<string, string>;
            pos?: string;
            morphemes?: Array<{
              form: Record<string, string>;
              gloss?: Record<string, string>;
              pos?: string;
            }>;
          }>;
        }>
      > = eafResult?.translationTiers ??
      tgResult?.additionalTiers ??
      toolboxResult?.additionalTiers ??
      flexResult?.additionalTiers ??
      new Map();

      if (flexResult && flexResult.phraseGlosses.size > 0) {
        const glossSegments = flexResult.units
          .map((u) => {
            const phraseId =
              'phraseId' in u && typeof (u as { phraseId?: string }).phraseId === 'string'
                ? (u as { phraseId: string }).phraseId
                : undefined;
            return {
              startTime: u.startTime,
              endTime: u.endTime,
              text: phraseId ? (flexResult.phraseGlosses.get(phraseId) ?? '') : '',
            };
          })
          .filter((s) => s.text.trim() !== '');
        if (glossSegments.length > 0) additionalTiers.set('FLEx Gloss', glossSegments);
      }

      const textId = activeTextId ?? (await getActiveTextId());
      resolvedTextId = textId;
      if (!textId) {
        setSaveState({ kind: 'error', message: t(locale, 'transcription.importExport.noProject') });
        return;
      }
      const importTextId = textId;
      let mediaId =
        segmentScopeMediaId?.trim() || activeTimelineMediaItem?.id || selectedUnitMedia?.id;

      if (
        !mediaId &&
        eafResult &&
        eafResult.mediaFilename &&
        eafResult.mediaFilename !== 'unknown.wav'
      ) {
        const { mediaId: newMediaId } = await LinguisticService.media.importAudio({
          textId,
          audioBlob: new Blob([], { type: 'audio/wav' }),
          filename: eafResult.mediaFilename,
          duration: 0,
        });
        mediaId = newMediaId;
      }

      const db = await getDb();
      const now = new Date().toISOString();
      const currentText = await db.dexie.texts.get(importTextId);
      let establishedDocumentSpanSec = 0;
      let establishedAcousticSec = 0;
      if (currentText) {
        const mediaRows = await db.dexie.media_items.where('textId').equals(importTextId).toArray();
        const mediaIds = mediaRows.map((row) => row.id);
        const unitsOnText =
          mediaIds.length > 0 ? await LayerSegmentQueryService.listUnitsByMediaIds(mediaIds) : [];
        establishedDocumentSpanSec = resolveEstablishedDocumentSpanSec(
          (currentText.metadata as Record<string, unknown> | undefined) ?? {},
          unitsOnText,
        );
        establishedAcousticSec = resolveEstablishedAcousticDurationSec(mediaRows);
      }
      const importedUnitsMaxEndSec = resolveImportedUnitsMaxEndSec(parsedUnits);
      const importedLogicalDurationSec =
        typeof importedTimelineMetadata?.logicalDurationSec === 'number' &&
        Number.isFinite(importedTimelineMetadata.logicalDurationSec) &&
        importedTimelineMetadata.logicalDurationSec > 0
          ? importedTimelineMetadata.logicalDurationSec
          : undefined;
      const mismatchNotices = assessAnnotationImportMismatch({
        establishedDocumentSpanSec,
        establishedAcousticSec,
        importedUnitsMaxEndSec,
        ...(importedLogicalDurationSec !== undefined ? { importedLogicalDurationSec } : {}),
      });
      if (mismatchNotices.length > 0 && !importOptions?.mismatchAcknowledged) {
        throw new ImportMismatchRequiresAckError(file.name, mismatchNotices);
      }

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
        return (
          await applyOrthographyBridgeIfNeeded({
            text: inputData.text,
            ...(inputData.sourceOrthographyId !== undefined
              ? { sourceOrthographyId: inputData.sourceOrthographyId }
              : {}),
            targetOrthographyId,
            ...(inputData.bridgeId !== undefined ? { bridgeId: inputData.bridgeId } : {}),
          })
        ).text;
      }

      async function ensureSourcePreservationLayer(inputData: {
        targetLayerId?: string;
        baseLabel: string;
        languageId: string;
        sourceOrthographyId?: string;
        layerType: LayerDocType['layerType'];
        keyPrefix: string;
        constraint?: LayerDocType['constraint'];
        /** Transcription tree parent only (non-translation dedupe). */
        transcriptionTreeParentId?: string;
        /** Translation: preferred host transcription id (layer_links SSOT). */
        preferredHostTranscriptionLayerId?: string;
        tierName?: string;
      }): Promise<string | undefined> {
        const sourceOrthographyId = inputData.sourceOrthographyId?.trim();
        const targetLayer = inputData.targetLayerId
          ? layerById.get(inputData.targetLayerId)
          : undefined;
        const targetOrthographyId = targetLayer?.orthographyId?.trim();
        if (
          !sourceOrthographyId ||
          !targetLayer ||
          !targetOrthographyId ||
          sourceOrthographyId === targetOrthographyId
        ) {
          return inputData.targetLayerId;
        }

        const desiredName = buildSourcePreservationLayerName(inputData.baseLabel);
        const desiredTranslationHost = (inputData.preferredHostTranscriptionLayerId ?? '').trim();
        let existingLayer: LayerDocType | undefined;
        for (const layer of layersAfterImport) {
          if (layer.layerType !== inputData.layerType) continue;
          if (layer.layerType === 'translation') {
            const resolvedHost = await resolvePreferredHostTranscriptionLayerIdForTranslationImport(
              db,
              layer.id,
            );
            if ((resolvedHost ?? '') !== desiredTranslationHost) continue;
          } else if (
            (getLayerTreeParentLayerId(layer) ?? '') !== (inputData.transcriptionTreeParentId ?? '')
          ) {
            continue;
          }
          if ((layer.constraint ?? '') !== (inputData.constraint ?? '')) continue;
          if (layer.languageId !== inputData.languageId) continue;
          if ((layer.orthographyId?.trim() ?? '') !== sourceOrthographyId) continue;
          if (resolveLayerNameText(layer.name) !== resolveLayerNameText(desiredName)) continue;
          existingLayer = layer;
          break;
        }
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
          ...(inputData.layerType !== 'translation'
            ? layerDocPatchWithTreeParent(inputData.transcriptionTreeParentId)
            : {}),
          createdAt: now,
          updatedAt: now,
        };
        await LayerTierUnifiedService.createLayer(newLayer);
        rememberLayer(newLayer);
        if (inputData.layerType === 'translation' && desiredTranslationHost) {
          const hostLayer = layerById.get(desiredTranslationHost);
          if (hostLayer?.key) {
            await db.collections.layer_links.insert({
              id: newId('link'),
              transcriptionLayerKey: hostLayer.key,
              hostTranscriptionLayerId: desiredTranslationHost,
              layerId,
              linkType: 'free',
              isPreferred: true,
              createdAt: now,
            });
          }
        }
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
        transcriptionTreeParentId?: string;
        preferredHostTranscriptionLayerId?: string;
        tierName?: string;
      }): Promise<Array<{ layerId: string; text: string }>> {
        const targetLayerId = inputData.targetLayerId?.trim();
        if (!targetLayerId || !inputData.text.trim()) return [];

        const targetLayer = layerById.get(targetLayerId);
        const sourceOrthographyId = inputData.sourceOrthographyId?.trim();
        const targetOrthographyId = targetLayer?.orthographyId?.trim();
        const needsSeparateSourceLayer = Boolean(
          targetLayer &&
          sourceOrthographyId &&
          targetOrthographyId &&
          sourceOrthographyId !== targetOrthographyId,
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
                ...layerDocPatchWithTreeParent(inputData.transcriptionTreeParentId),
                ...(inputData.preferredHostTranscriptionLayerId
                  ? {
                      preferredHostTranscriptionLayerId:
                        inputData.preferredHostTranscriptionLayerId,
                    }
                  : {}),
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
      const { resolveDbLanguageName, resolveEafLanguageLabel, resolveLayerDisplayName } =
        createImportLanguageResolvers({
          languageNameByIso,
          ...(eafResult ? { eafLanguageLabels: eafResult.languageLabels } : {}),
        });
      const { speakerIdMap, resolveOrCreateSpeaker } = await createImportSpeakerResolver({
        normalizeSpeakerLookupKey,
      });

      type PendingImportSpeaker = {
        rawKey: string;
        displayName: string;
        attrs?: { dialect?: string; accent?: string; languageIds?: string[] };
      };
      const pendingSpeakers: PendingImportSpeaker[] = [];
      if (eafResult && eafResult.participants.length > 0) {
        for (const speakerName of eafResult.participants) {
          pendingSpeakers.push({ rawKey: speakerName, displayName: speakerName });
        }
      } else if (trsResult && trsResult.speakers.length > 0) {
        for (const trsSpeaker of trsResult.speakers) {
          pendingSpeakers.push({
            rawKey: trsSpeaker.id,
            displayName: trsSpeaker.name,
            attrs: {
              ...(trsSpeaker.dialect ? { dialect: trsSpeaker.dialect } : {}),
              ...(trsSpeaker.accent ? { accent: trsSpeaker.accent } : {}),
              ...(trsSpeaker.lang ? { languageIds: [trsSpeaker.lang] } : {}),
            },
          });
        }
      }

      let effectiveTranscriptionLayerId = defaultTranscriptionLayerId;
      let autoCreatedLayerKey: string | undefined;
      let pendingAutoLayer:
        | {
            doc: LayerDocType;
            displayName: string;
            source: ReturnType<typeof resolveLayerDisplayName>['source'];
            matchedTag?: string;
            languageId: string;
            tierName?: string;
          }
        | undefined;

      const importedTrcName =
        eafResult?.transcriptionTierName ?? tgResult?.transcriptionTierName ?? undefined;
      const importedTierMetadata =
        eafResult?.tierMetadata ??
        tgResult?.tierMetadata ??
        new Map<string, { languageId?: string; orthographyId?: string; bridgeId?: string }>();
      const importedTranscriptionMeta = importedTrcName
        ? importedTierMetadata.get(importedTrcName)
        : undefined;
      const importedTranscriptionBridgeId = importedTranscriptionMeta?.bridgeId ?? undefined;
      const inferredTranscriptionLang =
        importedTranscriptionMeta?.languageId ??
        eafResult?.defaultLocale ??
        flexResult?.sourceLanguage ??
        trsResult?.speakers?.[0]?.lang ??
        'und';

      const tierNameToLayerId = new Map<string, string>();

      if (parsedUnits.some((u) => u.transcription.trim())) {
        const existingTrc = layers.filter((l) => l.layerType === 'transcription');
        {
          const dedupCandidates = new Set<string>();
          if (importedTrcName) {
            dedupCandidates.add(importedTrcName.toLocaleLowerCase('en'));
            dedupCandidates.add(humanizeTierName(importedTrcName).toLocaleLowerCase('en'));
            const dbResolvedByTierName = resolveDbLanguageName(importedTrcName);
            if (dbResolvedByTierName)
              dedupCandidates.add(dbResolvedByTierName.toLocaleLowerCase('en'));
          }
          const dbResolvedByLang = resolveDbLanguageName(inferredTranscriptionLang);
          if (dbResolvedByLang) dedupCandidates.add(dbResolvedByLang.toLocaleLowerCase('en'));

          const nameMatch = existingTrc.find((l) => {
            const eng =
              typeof l.name === 'object' && l.name !== null
                ? ((l.name as Record<string, string>).eng ?? '')
                : '';
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
          const eafTrcLangLabel =
            resolveEafLanguageLabel(inferredTranscriptionLang) ??
            resolveEafLanguageLabel(importedTrcName);
          autoCreatedLayerKey = eafResult
            ? withEafKeyMeta(baseTrcKey, {
                ...(importedTrcName ? { externalTierId: importedTrcName } : {}),
                ...(eafTrcLangLabel ? { langLabel: eafTrcLangLabel } : {}),
              })
            : baseTrcKey;
          const eafTrcConstraint = importedTrcName
            ? eafResult?.tierConstraints?.get(importedTrcName)
            : undefined;
          const autoCreatedLayerDoc: LayerDocType = {
            id: autoLayerId,
            textId,
            key: autoCreatedLayerKey,
            name: { eng: displayName, zho: displayName },
            layerType: 'transcription' as const,
            languageId: inferredTranscriptionLang,
            ...(importedTranscriptionMeta?.orthographyId
              ? { orthographyId: importedTranscriptionMeta.orthographyId }
              : {}),
            ...(importedTranscriptionBridgeId ? { bridgeId: importedTranscriptionBridgeId } : {}),
            modality: 'text' as const,
            acceptsAudio: false,
            sortOrder: 0,
            ...(eafTrcConstraint ? { constraint: eafTrcConstraint.constraint } : {}),
            createdAt: now,
            updatedAt: now,
          };
          pendingAutoLayer = {
            doc: autoCreatedLayerDoc,
            displayName,
            source: trcDisplayName.source,
            ...(trcDisplayName.matchedTag ? { matchedTag: trcDisplayName.matchedTag } : {}),
            languageId: inferredTranscriptionLang,
            ...(importedTrcName ? { tierName: importedTrcName } : {}),
          };
          rememberLayer(autoCreatedLayerDoc);
          tierNameToLayerId.set(importedTrcName ?? 'transcription', autoLayerId);
          effectiveTranscriptionLayerId = autoLayerId;
        }

        if (
          effectiveTranscriptionLayerId &&
          importedTrcName &&
          !tierNameToLayerId.has(importedTrcName)
        ) {
          tierNameToLayerId.set(importedTrcName, effectiveTranscriptionLayerId);
        }
      }

      const insertedUnits: Array<{
        id: string;
        startTime: number;
        endTime: number;
        unit: import('../../db').LayerUnitDocType;
      }> = [];
      let tierCount = 0;
      let skippedIndependentTierSegmentCount = 0;
      let droppedTranslationSegmentCount = 0;

      // Dynamic import must complete before the Dexie transaction; awaiting it inside
      // would auto-commit the txn ("Transaction committed too early").
      await loadOrthographyRuntime();

      const lexemeIdByFormKey = new Map<string, string>();
      const resolveImportLexemeId = async (
        form: Record<string, string>,
        language?: string,
      ): Promise<string | undefined> => {
        const surface =
          (typeof form.default === 'string' && form.default.trim()) ||
          (typeof form.eng === 'string' && form.eng.trim()) ||
          Object.values(form)
            .find((value) => typeof value === 'string' && value.trim())
            ?.trim();
        if (!surface) return undefined;
        const lang = language?.trim() || undefined;
        const cacheKey = `${lang ?? ''}::${surface}`;
        const cached = lexemeIdByFormKey.get(cacheKey);
        if (cached) return cached;
        const lexemeId = await LinguisticService.lexemes.matchOrCreateByForm({
          form: surface,
          ...(lang ? { language: lang } : {}),
        });
        if (lexemeId) lexemeIdByFormKey.set(cacheKey, lexemeId);
        return lexemeId;
      };

      await withTransaction(
        db,
        'rw',
        [...dexieStoresForAnnotationImportRw(db)],
        async () => {
          if (mediaId && eafResult?.secondaryMedia && eafResult.secondaryMedia.length > 0) {
            const mediaRow = await db.dexie.media_items.get(mediaId);
            if (mediaRow) {
              const prevDetails =
                mediaRow.details && typeof mediaRow.details === 'object' ? mediaRow.details : {};
              await db.dexie.media_items.put({
                ...mediaRow,
                details: {
                  ...prevDetails,
                  secondaryMedia: eafResult.secondaryMedia,
                },
              });
            }
          }

          if (importedTimelineMetadata) {
            const textRow = await db.dexie.texts.get(importTextId);
            if (textRow) {
              await db.dexie.texts.put({
                ...textRow,
                metadata: mergeImportedTimelineMetadata(
                  (textRow.metadata as Record<string, unknown> | undefined) ?? {},
                  importedTimelineMetadata,
                  {
                    establishedDocumentSpanSec,
                    establishedAcousticSec,
                    importedUnitsMaxEndSec,
                  },
                ),
                updatedAt: now,
              });
            }
          }

          for (const pending of pendingSpeakers) {
            await resolveOrCreateSpeaker(pending.rawKey, pending.displayName, pending.attrs);
          }

          if (pendingAutoLayer) {
            await LayerTierUnifiedService.createLayer(pendingAutoLayer.doc);
            await writeImportLayerNameAudit({
              db,
              now,
              layerId: pendingAutoLayer.doc.id,
              displayName: pendingAutoLayer.displayName,
              source: pendingAutoLayer.source,
              languageId: pendingAutoLayer.languageId,
              ...(pendingAutoLayer.tierName ? { tierName: pendingAutoLayer.tierName } : {}),
              ...(pendingAutoLayer.matchedTag ? { matchedTag: pendingAutoLayer.matchedTag } : {}),
            });
          }

          for (const u of parsedUnits) {
            const id = newId('utt');
            const startTime = Number(u.startTime.toFixed(3));
            const endTime = Number(u.endTime.toFixed(3));
            const maybeTokens = 'tokens' in u ? (u as { tokens?: unknown }).tokens : undefined;
            const maybeSpeakerId =
              'speakerId' in u ? (u as { speakerId?: unknown }).speakerId : undefined;
            const maybeAnnotationId =
              'annotationId' in u &&
              typeof (u as { annotationId?: string }).annotationId === 'string'
                ? (u as { annotationId: string }).annotationId
                : undefined;
            const normalizedSpeakerKey =
              typeof maybeSpeakerId === 'string' ? normalizeSpeakerLookupKey(maybeSpeakerId) : '';
            const resolvedSpeakerId =
              typeof maybeSpeakerId === 'string' && maybeSpeakerId.length > 0
                ? (speakerIdMap.get(normalizedSpeakerKey) ?? maybeSpeakerId.trim())
                : undefined;
            const newUnit: import('../../db').LayerUnitDocType = {
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
            await LinguisticService.units.save(newUnit);

            if (Array.isArray(maybeTokens) && maybeTokens.length > 0) {
              const tokenRows: import('../../db').UnitTokenDocType[] = [];
              const morphRows: import('../../db').UnitMorphemeDocType[] = [];

              for (const [tokenIndex, rawToken] of maybeTokens.entries()) {
                if (!rawToken || typeof rawToken !== 'object') continue;
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
                if (!token.form || typeof token.form !== 'object') continue;
                const tokenId = newId('tok');
                const tokenLexemeId = await resolveImportLexemeId(
                  token.form,
                  inferredTranscriptionLang,
                );
                tokenRows.push({
                  id: tokenId,
                  textId,
                  unitId: id,
                  form: token.form,
                  ...(token.gloss ? { gloss: token.gloss } : {}),
                  ...(token.pos ? { pos: token.pos } : {}),
                  ...(tokenLexemeId ? { lexemeId: tokenLexemeId } : {}),
                  tokenIndex,
                  createdAt: now,
                  updatedAt: now,
                });

                const morphemes = Array.isArray(token.morphemes) ? token.morphemes : [];
                for (const [morphemeIndex, morph] of morphemes.entries()) {
                  if (!morph?.form || typeof morph.form !== 'object') continue;
                  const morphLexemeId = await resolveImportLexemeId(
                    morph.form,
                    inferredTranscriptionLang,
                  );
                  morphRows.push({
                    id: newId('morph'),
                    textId,
                    unitId: id,
                    tokenId,
                    form: morph.form,
                    ...(morph.gloss ? { gloss: morph.gloss } : {}),
                    ...(morph.pos ? { pos: morph.pos } : {}),
                    ...(morphLexemeId ? { lexemeId: morphLexemeId } : {}),
                    morphemeIndex,
                    createdAt: now,
                    updatedAt: now,
                  });
                }
              }

              if (tokenRows.length > 0) {
                await LinguisticService.units.saveTokensBatch(tokenRows);
              }
              if (morphRows.length > 0) {
                await LinguisticService.units.saveMorphemesBatch(morphRows);
              }
              const linkRows: import('../../db').TokenLexemeLinkDocType[] = [];
              for (const token of tokenRows) {
                if (!token.lexemeId) continue;
                linkRows.push({
                  id: newId('tll'),
                  targetType: 'token',
                  targetId: token.id,
                  lexemeId: token.lexemeId,
                  createdAt: now,
                  updatedAt: now,
                });
              }
              for (const morph of morphRows) {
                if (!morph.lexemeId) continue;
                linkRows.push({
                  id: newId('tll'),
                  targetType: 'morpheme',
                  targetId: morph.id,
                  lexemeId: morph.lexemeId,
                  createdAt: now,
                  updatedAt: now,
                });
              }
              if (linkRows.length > 0) {
                await db.dexie.token_lexeme_links.bulkPut(linkRows);
              }
            }
            insertedUnits.push({ id, startTime, endTime, unit: newUnit });

            if (u.transcription.trim() && effectiveTranscriptionLayerId) {
              const transcriptionWrites = await planImportedWrites({
                text: u.transcription,
                ...(importedTranscriptionMeta?.orthographyId !== undefined
                  ? { sourceOrthographyId: importedTranscriptionMeta.orthographyId }
                  : {}),
                ...(importedTranscriptionBridgeId !== undefined
                  ? { bridgeId: importedTranscriptionBridgeId }
                  : {}),
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
                const doc: LayerUnitContentDocType = {
                  id: newId('utr'),
                  unitId: id,
                  layerId: write.layerId,
                  modality: 'text' as const,
                  text: write.text,
                  sourceType: 'human' as const,
                  ...(maybeAnnotationId ? { externalRef: maybeAnnotationId } : {}),
                  createdAt: now,
                  updatedAt: now,
                };
                await syncUnitTextToSegmentationV2(db, newUnit, doc);
              }
            }
          }

          const additionalResult = await importAdditionalTiers({
            db,
            now,
            textId,
            ...(mediaId ? { mediaId } : {}),
            layers,
            additionalTiers,
            insertedUnits,
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
            lexemeIdByFormKey,
          });
          tierCount = additionalResult.tierCount;
          skippedIndependentTierSegmentCount = additionalResult.skippedIndependentTierSegmentCount;
          droppedTranslationSegmentCount = additionalResult.droppedTranslationSegmentCount;

          if (eafResult?.userNotes && eafResult.userNotes.length > 0) {
            for (const note of eafResult.userNotes) {
              const match = insertedUnits.find(
                (unit) =>
                  Math.abs(unit.startTime - note.startTime) < 0.05 &&
                  Math.abs(unit.endTime - note.endTime) < 0.05,
              );
              if (!match || !note.text.trim()) continue;
              await db.dexie.user_notes.put(
                normalizeUserNoteDocForStorage({
                  id: newId('note'),
                  targetType: 'unit',
                  targetId: match.id,
                  content: { default: note.text },
                  createdAt: now,
                  updatedAt: now,
                }),
              );
            }
          }

          if (trsResult?.sectionTopics && trsResult.sectionTopics.length > 0) {
            for (const section of trsResult.sectionTopics) {
              if (!section.topic.trim()) continue;
              const matches = insertedUnits.filter(
                (unit) =>
                  unit.startTime < section.endTime + 0.05 &&
                  unit.endTime > section.startTime - 0.05,
              );
              for (const match of matches) {
                await db.dexie.user_notes.put(
                  normalizeUserNoteDocForStorage({
                    id: newId('note'),
                    targetType: 'unit',
                    targetId: match.id,
                    content: { default: section.topic },
                    category: 'topic',
                    createdAt: now,
                    updatedAt: now,
                  }),
                );
              }
            }
          }
        },
        { label: 'annotationImport.commit' },
      );

      fireAndForget(
        validateLayerTierConsistency(textId).then((issues) => {
          if (issues.length > 0) {
            log.warn('post-import consistency issues', { issues });
          }
        }),
        {
          context: 'src/hooks/importExport/useImportExport.importHandlers.ts:L633',
          policy: 'background',
        },
      );

      const layerIdSet = new Set(layersAfterImport.map((layer) => layer.id));
      const importLayerLinks: LayerLinkDocType[] = (await db.dexie.layer_links.toArray()).filter(
        (link) => layerIdSet.has(link.layerId),
      );

      const repairedResult = repairExistingLayerConstraints(
        layersAfterImport,
        undefined,
        locale,
        importLayerLinks,
      );
      const originalLayerById = new Map(
        layersAfterImport.map((layer) => [layer.id, layer] as const),
      );
      const changedLayers = repairedResult.layers.filter((layer) => {
        const before = originalLayerById.get(layer.id);
        if (!before) return false;
        return hasRepairPersistableLayerDiff(before, layer, layersAfterImport, importLayerLinks);
      });
      for (const changedLayer of changedLayers) {
        await LayerTierUnifiedService.updateLayer({
          ...changedLayer,
          updatedAt: now,
        });
      }
      const layerConstraintIssues = validateExistingLayerConstraints(
        repairedResult.layers,
        undefined,
        locale,
        importLayerLinks,
      );
      if (layerConstraintIssues.length > 0) {
        log.warn('layer constraint validation found issues', { layerConstraintIssues });
      }
      if (importOptions?.mismatchAcknowledged) {
        const expandTarget = resolvePostImportLogicalExpandTargetSec(mismatchNotices);
        if (expandTarget != null && expandTarget > 0) {
          await LinguisticService.media.expandTextLogicalDurationToAtLeast({
            textId: importTextId,
            minLogicalDurationSec: expandTarget,
          });
        }
      }
      await loadSnapshot();
      const importDoneMessage =
        tierCount > 0
          ? tf(locale, 'transcription.importExport.importDone.segmentsWithLayers', {
              count: parsedUnits.length,
              layers: tierCount,
            })
          : tf(locale, 'transcription.importExport.importDone.segments', {
              count: parsedUnits.length,
            });
      const hostRecoveryWarningCount = eafResult
        ? [...eafResult.tierConstraints.values()].filter(
            (constraintInfo) =>
              Boolean(constraintInfo.parentTierId) &&
              (constraintInfo.constraint === 'symbolic_association' ||
                constraintInfo.constraint === 'time_subdivision'),
          ).length
        : 0;
      setSaveState({
        kind: 'done',
        message: [
          importDoneMessage,
          ...(skippedIndependentTierSegmentCount > 0
            ? [
                tf(
                  locale,
                  'transcription.importExport.importDone.independentSegmentsSkippedNoMedia',
                  {
                    count: skippedIndependentTierSegmentCount,
                  },
                ),
              ]
            : []),
          ...(droppedTranslationSegmentCount > 0
            ? [
                tf(locale, 'transcription.importExport.importDone.translationsDroppedNoMatch', {
                  count: droppedTranslationSegmentCount,
                }),
              ]
            : []),
          ...(repairedResult.repairs.length > 0
            ? [
                tf(locale, 'transcription.importExport.importDone.constraintRepaired', {
                  count: repairedResult.repairs.length,
                }),
              ]
            : []),
          ...(layerConstraintIssues.length > 0
            ? [
                tf(locale, 'transcription.importExport.importDone.constraintWarning', {
                  count: layerConstraintIssues.length,
                }),
              ]
            : []),
          ...(hostRecoveryWarningCount > 0
            ? [
                tf(locale, 'transcription.importExport.importDone.hostRecoveryWarning', {
                  count: hostRecoveryWarningCount,
                }),
              ]
            : []),
        ].join(' '),
      });
    } catch (err) {
      if (err instanceof ImportMismatchRequiresAckError) {
        throw err;
      }
      const rawMessage = toErrorMessage(err);
      if (rawMessage === 'TOOLBOX_FORMAT_UNRECOGNIZED') {
        setSaveState({
          kind: 'error',
          message: t(locale, 'transcription.importExport.toolboxFormatUnrecognized'),
        });
        return;
      }
      log.error('Import file failed', {
        fileName: file.name,
        isArchive: isJieyuArchive,
        resolvedTextId,
        error: rawMessage,
      });
      reportActionError({
        actionLabel: t(locale, 'transcription.importExport.actionLabelImportFile'),
        error: err,
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
        conflictNames: ['TranscriptionPersistenceConflictError', 'RecoveryApplyConflictError'],
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
