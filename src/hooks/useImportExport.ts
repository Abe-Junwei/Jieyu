import { useCallback, useRef, useState } from 'react';
import { getDb } from '../db';
import { useClickOutside } from './useClickOutside';
import type {
  AnchorDocType,
  LayerSegmentDocType,
  MediaItemDocType,
  LayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
import type { SaveState } from './useTranscriptionData';
import { LinguisticService } from '../services/LinguisticService';
import { validateLayerTierConsistency } from '../services/TierBridgeService';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
import { repairExistingLayerConstraints, validateExistingLayerConstraints } from '../services/LayerConstraintService';
import { exportToEaf, importFromEaf, downloadEaf } from '../services/EafService';
import { ingestTextFile } from '../utils/textIngestion';
import type { EafImportResult } from '../services/EafService';
import { exportToTextGrid, importFromTextGrid, downloadTextGrid } from '../services/TextGridService';
import type { TextGridImportResult } from '../services/TextGridService';
import { exportToTrs, importFromTrs, downloadTrs } from '../services/TranscriberService';
import { exportToFlextext, importFromFlextext, downloadFlextext } from '../services/FlexService';
import { exportToToolbox, importFromToolbox, downloadToolbox } from '../services/ToolboxService';
import { downloadJieyuArchive, importJieyuArchiveFile } from '../services/JymService';
import { detectLocale, t, tf } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import { newId } from '../utils/transcriptionFormatters';
import { humanizeTierName } from '../utils/transcriptionFormatters';
import { parseBcp47 } from '../utils/transcriptionFormatters';
import { createLogger } from '../observability/logger';
import { toErrorMessage } from '../utils/saveStateError';
import { reportActionError } from '../utils/actionErrorReporter';
import { syncUtteranceTextToSegmentationV2 } from '../services/LayerSegmentationTextService';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';
import { useOrthographies } from './useOrthographies';
import { applyOrthographyTransformIfNeeded } from '../utils/orthographyRuntime';

const log = createLogger('useImportExport');

/** 将 EAF 元数据编码进层 key，便于导出时保留外部标识 | Encode EAF metadata in layer key for export-time external fidelity */
function withEafKeyMeta(baseKey: string, meta?: { tierId?: string; langLabel?: string }): string {
  if (!meta) return baseKey;
  const tierId = meta.tierId?.trim();
  const langLabel = meta.langLabel?.trim();
  if (!tierId && !langLabel) return baseKey;
  const payload = JSON.stringify({
    ...(tierId ? { tierId } : {}),
    ...(langLabel ? { langLabel } : {}),
  });
  return `${baseKey}__eafmeta_${encodeURIComponent(payload)}`;
}

interface UseImportExportInput {
  activeTextId: string | null;
  getActiveTextId: () => Promise<string | null>;
  selectedUtteranceMedia: MediaItemDocType | undefined;
  utterancesOnCurrentMedia: UtteranceDocType[];
  anchors: AnchorDocType[];
  layers: LayerDocType[];
  translations: UtteranceTextDocType[];
  defaultTranscriptionLayerId: string | undefined;
  loadSnapshot: () => Promise<void>;
  setSaveState: React.Dispatch<React.SetStateAction<SaveState>>;
}

export function useImportExport(input: UseImportExportInput) {
  const locale = detectLocale();
  const {
    activeTextId,
    getActiveTextId,
    selectedUtteranceMedia,
    utterancesOnCurrentMedia,
    anchors,
    layers,
    translations,
    defaultTranscriptionLayerId,
    loadSnapshot,
    setSaveState,
  } = input;
  const orthographyLanguageIds = Array.from(new Set(layers.map((layer) => layer.languageId).filter((languageId): languageId is string => Boolean(languageId))));
  const orthographies = useOrthographies(orthographyLanguageIds);

  const normalizeSpeakerLookupKey = useCallback((value: string | undefined) => {
    return value?.trim().toLocaleLowerCase('zh-Hans-CN') ?? '';
  }, []);

  const resolveRelevantExportSpeakerIds = useCallback((
    currentUtterances: UtteranceDocType[],
    layerSegments?: Map<string, LayerSegmentDocType[]>,
  ) => {
    const ids = new Set<string>();
    for (const utterance of currentUtterances) {
      const speakerId = utterance.speakerId?.trim();
      if (speakerId) ids.add(speakerId);
    }
    if (layerSegments) {
      for (const segments of layerSegments.values()) {
        for (const segment of segments) {
          const speakerId = segment.speakerId?.trim();
          if (speakerId) ids.add(speakerId);
        }
      }
    }
    return ids;
  }, []);

  const importFileRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Use centralized click-outside pattern to avoid race condition with click handlers
  useClickOutside(
    exportMenuRef as React.RefObject<HTMLElement | null>,
    () => setShowExportMenu(false),
    { closeOnEscape: true },
  );

  const fetchUtteranceNotes = useCallback(async (uttIds: string[]) => {
    if (uttIds.length === 0) return [];
    const db = await getDb();
    return db.dexie.user_notes
      .where('[targetType+targetId]')
      .anyOf(uttIds.map((id) => ['utterance', id]))
      .toArray();
  }, []);

  const loadSegmentExportDataForLayers = useCallback(async (
    targetLayers: LayerDocType[],
    mediaId: string | undefined,
  ) => {
    if (!mediaId || targetLayers.length === 0) return {};

    const segMap = new Map<string, import('../db').LayerSegmentDocType[]>();
    const contentMap = new Map<string, Map<string, import('../db').LayerSegmentContentDocType>>();

    for (const layer of targetLayers) {
      const orderedSegments = await LayerSegmentQueryService.listSegmentsByLayerMedia(layer.id, mediaId);
      if (orderedSegments.length === 0) continue;
      segMap.set(layer.id, orderedSegments);

      const segmentIds = orderedSegments.map((segment) => segment.id);
      const mergedContents = await LayerSegmentQueryService.listSegmentContentsBySegmentIds(segmentIds, {
        layerId: layer.id,
        modality: 'text',
      });

      const mergedContentMap = new Map<string, import('../db').LayerSegmentContentDocType>();
      for (const content of mergedContents) {
        mergedContentMap.set(content.segmentId, content);
      }

      if (mergedContentMap.size > 0) {
        contentMap.set(layer.id, mergedContentMap);
      }
    }

    return {
      ...(segMap.size > 0 ? { segmentsByLayer: segMap as Map<string, import('../db').LayerSegmentDocType[]> } : {}),
      ...(contentMap.size > 0
        ? { segmentContents: contentMap as Map<string, Map<string, import('../db').LayerSegmentContentDocType>> }
        : {}),
    };
  }, []);

  /** 加载所有具有 segment 约束的层的 segment 及内容（TextGrid/FLEx/Toolbox 导出共用）
   *  Load layers with segment constraints (independent_boundary / time_subdivision) — shared by TextGrid/FLEx/Toolbox export */
  const loadSegmentExportData = useCallback(async (mediaId: string | undefined) => {
    const segmentLayers = layers.filter(
      (l) => l.constraint === 'independent_boundary' || l.constraint === 'time_subdivision',
    );
    return loadSegmentExportDataForLayers(segmentLayers, mediaId);
  }, [layers, loadSegmentExportDataForLayers]);

  const loadProjectPrimaryOrthographyId = useCallback(async () => {
    const textId = activeTextId ?? await getActiveTextId();
    if (!textId) return undefined;
    const db = await getDb();
    const textRow = await db.dexie.texts?.get?.(textId);
    const metadata = textRow && typeof textRow === 'object'
      ? (textRow as { metadata?: { primaryOrthographyId?: unknown } }).metadata
      : undefined;
    return typeof metadata?.primaryOrthographyId === 'string' && metadata.primaryOrthographyId.trim().length > 0
      ? metadata.primaryOrthographyId.trim()
      : undefined;
  }, [activeTextId, getActiveTextId]);

  const buildOrthographyAwareExportUtterances = useCallback(async (
    currentUtterances: UtteranceDocType[],
    defaultLayer: LayerDocType | undefined,
  ) => {
    const targetOrthographyId = defaultLayer?.orthographyId?.trim();
    if (!defaultLayer?.id || !targetOrthographyId) return currentUtterances;

    const sourceOrthographyId = await loadProjectPrimaryOrthographyId();
    if (!sourceOrthographyId || sourceOrthographyId === targetOrthographyId) {
      return currentUtterances;
    }

    const defaultLayerTextUtteranceIds = new Set(
      translations
        .filter((item) => item.layerId === defaultLayer.id && item.modality === 'text' && typeof item.text === 'string' && item.text.trim().length > 0)
        .map((item) => item.utteranceId),
    );

    let didChange = false;
    const transformedTextCache = new Map<string, string>();
    const nextUtterances = await Promise.all(currentUtterances.map(async (utterance) => {
      if (defaultLayerTextUtteranceIds.has(utterance.id)) return utterance;
      const legacyText = utterance.transcription?.default ?? '';
      if (!legacyText.trim()) return utterance;

      let transformedText = transformedTextCache.get(legacyText);
      if (transformedText === undefined) {
        transformedText = (await applyOrthographyTransformIfNeeded({
          text: legacyText,
          sourceOrthographyId,
          targetOrthographyId,
        })).text;
        transformedTextCache.set(legacyText, transformedText);
      }

      if (transformedText === legacyText) return utterance;
      didChange = true;
      return {
        ...utterance,
        transcription: {
          ...(utterance.transcription ?? {}),
          default: transformedText,
        },
      } as UtteranceDocType;
    }));

    return didChange ? nextUtterances : currentUtterances;
  }, [loadProjectPrimaryOrthographyId, translations]);

  const handleExportEaf = useCallback(async () => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const userNotes = await fetchUtteranceNotes(utterancesOnCurrentMedia.map((u) => u.id));
    const defaultTrcLayer = layers.find((layer) => layer.id === defaultTranscriptionLayerId)
      ?? layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault)
      ?? layers.find((layer) => layer.layerType === 'transcription');
    // Query segments for time-aligned layers (translation + independent transcription)
    // 查询时间对齐层的 segment 数据（翻译层 + 独立转写层）
    const timeAlignedLayers = layers.filter(
      (l) =>
        (l.layerType === 'translation' && (l.constraint === 'independent_boundary' || l.constraint === 'time_subdivision'))
        || (l.layerType === 'transcription' && (l.constraint === 'independent_boundary' || l.constraint === 'time_subdivision')),
    );
    const exportData = await loadSegmentExportDataForLayers(timeAlignedLayers, utterancesOnCurrentMedia[0]?.mediaId) as {
      segmentsByLayer?: Map<string, import('../db').LayerSegmentDocType[]>;
      segmentContents?: Map<string, Map<string, import('../db').LayerSegmentContentDocType>>;
    };
    const layerSegments = exportData.segmentsByLayer;
    const layerSegmentContents = exportData.segmentContents;
    const db = await getDb();
    const relevantSpeakerIds = resolveRelevantExportSpeakerIds(utterancesOnCurrentMedia, layerSegments);
    const speakers = relevantSpeakerIds.size === 0
      ? []
      : (await db.dexie.speakers.toArray()).filter((speaker) => relevantSpeakerIds.has(speaker.id));
    const exportUtterances = await buildOrthographyAwareExportUtterances(utterancesOnCurrentMedia, defaultTrcLayer);
    const xml = exportToEaf({
      ...(selectedUtteranceMedia ? { mediaItem: selectedUtteranceMedia } : {}),
      utterances: exportUtterances,
      anchors,
      layers,
      orthographies,
      translations,
      userNotes,
      ...(layerSegments ? { layerSegments } : {}),
      ...(layerSegmentContents ? { layerSegmentContents } : {}),
      ...(defaultTranscriptionLayerId ? { defaultTranscriptionLayerId } : {}),
      speakers,
    });
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'export';
    downloadEaf(xml, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.eaf') });
    setShowExportMenu(false);
  }, [buildOrthographyAwareExportUtterances, defaultTranscriptionLayerId, selectedUtteranceMedia, utterancesOnCurrentMedia, anchors, layers, orthographies, translations, setSaveState, fetchUtteranceNotes, loadSegmentExportDataForLayers, resolveRelevantExportSpeakerIds]);

  const handleExportTextGrid = useCallback(async () => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const userNotes = await fetchUtteranceNotes(utterancesOnCurrentMedia.map((u) => u.id));
    const exportData = (await loadSegmentExportData(utterancesOnCurrentMedia[0]?.mediaId)) as any;
    const segmentsByLayer = exportData?.segmentsByLayer;
    const segmentContents = exportData?.segmentContents;
    const defaultTrcLayer = layers.find((layer) => layer.id === defaultTranscriptionLayerId)
      ?? layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault)
      ?? layers.find((layer) => layer.layerType === 'transcription');
    const exportUtterances = await buildOrthographyAwareExportUtterances(utterancesOnCurrentMedia, defaultTrcLayer);
    const tg = exportToTextGrid({
      utterances: exportUtterances,
      layers,
      orthographies,
      translations,
      userNotes,
      ...(segmentsByLayer ? { segmentsByLayer } : {}),
      ...(segmentContents ? { segmentContents } : {}),
    });
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'export';
    downloadTextGrid(tg, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.textgrid') });
    setShowExportMenu(false);
  }, [buildOrthographyAwareExportUtterances, defaultTranscriptionLayerId, selectedUtteranceMedia, utterancesOnCurrentMedia, layers, translations, setSaveState, fetchUtteranceNotes, loadSegmentExportData]);

  const handleExportTrs = useCallback(async () => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const transcriptionLayer = layers.find((layer) => layer.id === defaultTranscriptionLayerId)
      ?? layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault)
      ?? layers.find((layer) => layer.layerType === 'transcription');
    const exportUtterances = await buildOrthographyAwareExportUtterances(utterancesOnCurrentMedia, transcriptionLayer);
    const trs = exportToTrs({
      utterances: exportUtterances,
      orthographies,
      ...(transcriptionLayer !== undefined ? { transcriptionLayer } : {}),
    });
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'export';
    downloadTrs(trs, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.trs') });
    setShowExportMenu(false);
  }, [buildOrthographyAwareExportUtterances, defaultTranscriptionLayerId, layers, orthographies, selectedUtteranceMedia, utterancesOnCurrentMedia, setSaveState]);

  const handleExportFlextext = useCallback(async () => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const exportData2 = (await loadSegmentExportData(utterancesOnCurrentMedia[0]?.mediaId)) as any;
    const segmentsByLayer = exportData2?.segmentsByLayer;
    const segmentContents = exportData2?.segmentContents;
    const defaultTrcLayer = layers.find((layer) => layer.id === defaultTranscriptionLayerId)
      ?? layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault)
      ?? layers.find((layer) => layer.layerType === 'transcription');
    const exportUtterances = await buildOrthographyAwareExportUtterances(utterancesOnCurrentMedia, defaultTrcLayer);
    const flex = exportToFlextext({
      utterances: exportUtterances,
      layers,
      orthographies,
      translations,
      ...(segmentsByLayer ? { segmentsByLayer } : {}),
      ...(segmentContents ? { segmentContents } : {}),
    });
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'export';
    downloadFlextext(flex, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.flextext') });
    setShowExportMenu(false);
  }, [buildOrthographyAwareExportUtterances, defaultTranscriptionLayerId, selectedUtteranceMedia, utterancesOnCurrentMedia, layers, translations, setSaveState, loadSegmentExportData]);

  const handleExportToolbox = useCallback(async () => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const exportData3 = (await loadSegmentExportData(utterancesOnCurrentMedia[0]?.mediaId)) as any;
    const segmentsByLayer = exportData3?.segmentsByLayer;
    const segmentContents = exportData3?.segmentContents;
    const defaultTrcLayer = layers.find((layer) => layer.id === defaultTranscriptionLayerId)
      ?? layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault)
      ?? layers.find((layer) => layer.layerType === 'transcription');
    const exportUtterances = await buildOrthographyAwareExportUtterances(utterancesOnCurrentMedia, defaultTrcLayer);
    const toolbox = exportToToolbox({
      utterances: exportUtterances,
      layers,
      orthographies,
      translations,
      ...(segmentsByLayer ? { segmentsByLayer } : {}),
      ...(segmentContents ? { segmentContents } : {}),
    });
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'export';
    downloadToolbox(toolbox, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.toolbox') });
    setShowExportMenu(false);
  }, [buildOrthographyAwareExportUtterances, defaultTranscriptionLayerId, selectedUtteranceMedia, utterancesOnCurrentMedia, layers, translations, setSaveState, loadSegmentExportData]);

  const handleExportJyt = useCallback(async () => {
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'jieyu-project';
    await downloadJieyuArchive('jyt', baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.jyt') });
    setShowExportMenu(false);
  }, [selectedUtteranceMedia, setSaveState]);

  const handleExportJym = useCallback(async () => {
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'jieyu-project';
    await downloadJieyuArchive('jym', baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.jym') });
    setShowExportMenu(false);
  }, [selectedUtteranceMedia, setSaveState]);

  const handleImportFile = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    const isJieyuArchive = name.endsWith('.jym') || name.endsWith('.jyt');
    let text = '';
    let resolvedTextId: string | null = activeTextId;

    try {
      if (!isJieyuArchive) {
        const xmlExts = ['.eaf', '.trs', '.flextext'];
        const isXml = xmlExts.some(ext => name.endsWith(ext));
        const ingested = await ingestTextFile(file, { xmlMode: isXml });
        text = ingested.text;
      }
      if (isJieyuArchive) {
        const imported = await importJieyuArchiveFile(file, { strategy: 'replace-all' });
        const totals = Object.values(imported.importResult.collections).reduce(
          (acc, c) => ({
            written: acc.written + (c?.written ?? 0),
            skipped: acc.skipped + (c?.skipped ?? 0),
          }),
          { written: 0, skipped: 0 },
        );
        await loadSnapshot();
        setSaveState({
          kind: 'done',
          message: tf(locale, 'transcription.importExport.importDone.archive', {
            kind: imported.kind.toUpperCase(),
            written: totals.written,
            skipped: totals.skipped,
          }),
        });
        return;
      }

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
      let mediaId = selectedUtteranceMedia?.id;

      // ── 为 EAF 导入创建 MediaItem（如果 EAF 包含媒体引用且当前未选择媒体）─────
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

      async function transformImportedText(inputData: {
        text: string;
        sourceOrthographyId?: string;
        targetLayerId?: string;
      }): Promise<string> {
        const targetOrthographyId = inputData.targetLayerId
          ? layerById.get(inputData.targetLayerId)?.orthographyId?.trim()
          : undefined;
        if (!inputData.text || !targetOrthographyId) {
          return inputData.text;
        }
        return (await applyOrthographyTransformIfNeeded({
          text: inputData.text,
          ...(inputData.sourceOrthographyId !== undefined ? { sourceOrthographyId: inputData.sourceOrthographyId } : {}),
          targetOrthographyId,
        })).text;
      }

      // ── 语言名反查：ISO 主码 -> 语言名（来自本地 DB）| Resolve language labels from local DB by ISO primary code ──
      const languageDocs = await db.collections.languages.find().exec();
      const languageNameByIso = new Map<string, string>();
      for (const doc of languageDocs) {
        const language = doc.toJSON();
        const fromName = typeof language.name === 'object' && language.name !== null
          ? ((language.name.zho ?? language.name.eng ?? Object.values(language.name).find((v) => typeof v === 'string' && v.trim().length > 0)) ?? '')
          : '';
        const displayName = (fromName || language.autonym || '').trim();
        if (!displayName) continue;
        languageNameByIso.set(language.id.toLocaleLowerCase('en'), displayName);
      }

      // 从语言标签提取主码并查 DB | Extract primary code from language tag and resolve via DB
      function resolveDbLanguageName(languageTagOrId?: string): string | undefined {
        if (!languageTagOrId) return undefined;
        const raw = languageTagOrId.trim();
        if (!raw) return undefined;
        const primary = parseBcp47(raw).primary;
        return languageNameByIso.get(raw.toLocaleLowerCase('en'))
          ?? (primary ? languageNameByIso.get(primary.toLocaleLowerCase('en')) : undefined);
      }

      // 从 EAF <LANGUAGE> 中取标签，支持完整 tag 和 primary code | Resolve label from EAF <LANGUAGE> by full tag or primary code
      function resolveEafLanguageLabel(languageTagOrId?: string): string | undefined {
        if (!eafResult || !languageTagOrId) return undefined;
        const raw = languageTagOrId.trim();
        if (!raw) return undefined;
        const primary = parseBcp47(raw).primary;
        return eafResult.languageLabels.get(raw)
          ?? (primary ? eafResult.languageLabels.get(primary) : undefined);
      }

      type LayerNameSource = 'db' | 'eaf' | 'fallback';

      // 按优先级解析层显示名并返回来源 | Resolve layer display name with source info
      function resolveLayerDisplayName(
        languageTagCandidates: Array<string | undefined>,
        fallbackName: string,
      ): { label: string; source: LayerNameSource; matchedTag?: string } {
        for (const candidate of languageTagCandidates) {
          const fromDb = resolveDbLanguageName(candidate);
          if (fromDb) {
            return { label: fromDb, source: 'db', ...(candidate ? { matchedTag: candidate } : {}) };
          }
        }
        for (const candidate of languageTagCandidates) {
          const fromEaf = resolveEafLanguageLabel(candidate);
          if (fromEaf) {
            return { label: fromEaf, source: 'eaf', ...(candidate ? { matchedTag: candidate } : {}) };
          }
        }
        return { label: fallbackName, source: 'fallback' };
      }

      // 导入命名来源审计 | Audit language-name source chosen during import
      async function writeImportLayerNameAudit(inputData: {
        layerId: string;
        displayName: string;
        source: LayerNameSource;
        languageId?: string;
        tierName?: string;
        matchedTag?: string;
      }): Promise<void> {
        try {
          await db.collections.audit_logs.insert({
            id: newId('audit'),
            collection: 'tier_definitions',
            documentId: inputData.layerId,
            action: 'create',
            field: 'name',
            ...(inputData.displayName ? { newValue: inputData.displayName } : {}),
            source: 'system',
            timestamp: now,
            metadataJson: JSON.stringify({
              mode: 'import-language-name-resolution',
              nameSource: inputData.source,
              ...(inputData.languageId ? { languageId: inputData.languageId } : {}),
              ...(inputData.tierName ? { tierName: inputData.tierName } : {}),
              ...(inputData.matchedTag ? { matchedTag: inputData.matchedTag } : {}),
            }),
          });
        } catch (auditErr) {
          console.warn('[Import] 语言名来源审计写入失败 | Failed to write language-name audit log', auditErr);
        }
      }

      // ── 创建说话人记录并建立 ID 映射（按名称去重）| Create speaker records with name-based dedup ──
      const speakerIdMap = new Map<string, string>(); // normalized key → DB speaker.id
      const existingSpeakers = await LinguisticService.getSpeakers();
      const speakerByName = new Map(
        existingSpeakers.map((s) => [normalizeSpeakerLookupKey(s.name), s] as const),
      );

      async function resolveOrCreateSpeaker(rawKey: string, displayName: string): Promise<string> {
        const normalized = normalizeSpeakerLookupKey(displayName);
        const normalizedRawKey = normalizeSpeakerLookupKey(rawKey);
        const existing = speakerByName.get(normalized);
        if (existing) {
          if (normalizedRawKey) speakerIdMap.set(normalizedRawKey, existing.id);
          if (normalized) speakerIdMap.set(normalized, existing.id);
          return existing.id;
        }
        const speaker = await LinguisticService.createSpeaker({ name: displayName.trim() });
        speakerByName.set(normalized, speaker);
        if (normalizedRawKey) speakerIdMap.set(normalizedRawKey, speaker.id);
        if (normalized) speakerIdMap.set(normalized, speaker.id);
        return speaker.id;
      }

      if (eafResult && eafResult.participants.length > 0) {
        for (const name of eafResult.participants) {
          await resolveOrCreateSpeaker(name, name);
        }
      } else if (trsResult && trsResult.speakers.length > 0) {
        for (const trsSpeaker of trsResult.speakers) {
          await resolveOrCreateSpeaker(trsSpeaker.id, trsSpeaker.name);
        }
      }

      // ── 转写层：按名称去重，名称匹配则复用，否则新建 | Transcription layer: dedup by name ──
      let effectiveTranscriptionLayerId = defaultTranscriptionLayerId;
      let autoCreatedLayerKey: string | undefined;

      // 推断导入文件的转写层名称 | Infer transcription tier name from parsed result
      const importedTrcName = eafResult?.transcriptionTierName
        ?? tgResult?.transcriptionTierName
        ?? undefined; // TRS / FLEx / Toolbox 无显式层名
      const importedTierMetadata = eafResult?.tierMetadata
        ?? tgResult?.tierMetadata
        ?? new Map<string, { languageId?: string; orthographyId?: string }>();
      const importedTranscriptionMeta = importedTrcName
        ? importedTierMetadata.get(importedTrcName)
        : undefined;
      const inferredTranscriptionLang = importedTranscriptionMeta?.languageId
        ?? eafResult?.defaultLocale
        ?? flexResult?.sourceLanguage
        ?? trsResult?.speakers?.[0]?.lang
        ?? 'und';

      // Tier 名称到 layer ID 的映射（用于 parentLayerId） | Mapping from tier name to layer ID (for parentLayerId)
      const tierNameToLayerId = new Map<string, string>();

      if (parsedUtterances.some((u) => u.transcription.trim())) {
        // 按名称在已有转写层中查找 | Search existing transcription layers by name
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
            const engLower = eng.toLocaleLowerCase('en');
            return dedupCandidates.has(engLower);
          });
          if (nameMatch) {
            effectiveTranscriptionLayerId = nameMatch.id;
          }
        }

        // 若无名称匹配且无默认层 → 新建 | No name match and no default → create new
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
              ...(importedTrcName ? { tierId: importedTrcName } : {}),
              ...(eafTrcLangLabel ? { langLabel: eafTrcLangLabel } : {}),
            })
            : baseTrcKey;
          // 从 EAF tierConstraints 获取转写层约束 | Get transcription tier constraint from EAF
          const eafTrcConstraint = importedTrcName ? eafResult?.tierConstraints?.get(importedTrcName) : undefined;
          const autoCreatedLayerDoc: LayerDocType = {
            id: autoLayerId,
            textId,
            key: autoCreatedLayerKey,
            name: { eng: displayName, zho: displayName },
            layerType: 'transcription' as const,
            languageId: inferredTranscriptionLang,
            ...(importedTranscriptionMeta?.orthographyId ? { orthographyId: importedTranscriptionMeta.orthographyId } : {}),
            modality: 'text' as const,
            acceptsAudio: false,
            sortOrder: 0,
            ...(eafTrcConstraint ? { constraint: eafTrcConstraint.constraint } : {}),
            createdAt: now,
            updatedAt: now,
          };
          await LayerTierUnifiedService.createLayer(autoCreatedLayerDoc);
          rememberLayer(autoCreatedLayerDoc);
          
          // Add to tier name mapping for potential parent reference by subsequent tiers | 添加到 tier 名称映射（用于后续层的父引用）
          tierNameToLayerId.set(importedTrcName ?? 'transcription', autoLayerId);
          
          await writeImportLayerNameAudit({
            layerId: autoLayerId,
            displayName,
            source: trcDisplayName.source,
            languageId: inferredTranscriptionLang,
            ...(importedTrcName ? { tierName: importedTrcName } : {}),
            ...(trcDisplayName.matchedTag ? { matchedTag: trcDisplayName.matchedTag } : {}),
          });
          effectiveTranscriptionLayerId = autoLayerId;
        }

        // 确保为翻译层父引用映射了 | Ensure mapped for translation layer parent references
        if (effectiveTranscriptionLayerId && importedTrcName && !tierNameToLayerId.has(importedTrcName)) {
          tierNameToLayerId.set(importedTrcName, effectiveTranscriptionLayerId);
        }
      }

      const insertedUtterances: Array<{ id: string; startTime: number; endTime: number; utterance: UtteranceDocType }> = [];
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
        // 将原始说话人标识映射为 DB ID | Resolve raw speaker label to DB speaker ID
        const resolvedSpeakerId = typeof maybeSpeakerId === 'string' && maybeSpeakerId.length > 0
          ? speakerIdMap.get(normalizedSpeakerKey) ?? maybeSpeakerId.trim()
          : undefined;
        const newUtterance: UtteranceDocType = {
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
          const transformedTranscription = await transformImportedText({
            text: u.transcription,
            ...(importedTranscriptionMeta?.orthographyId !== undefined ? { sourceOrthographyId: importedTranscriptionMeta.orthographyId } : {}),
            targetLayerId: effectiveTranscriptionLayerId,
          });
          const doc: UtteranceTextDocType = {
            id: newId('utr'),
            utteranceId: id,
            layerId: effectiveTranscriptionLayerId,
            modality: 'text' as const,
            text: transformedTranscription,
            sourceType: 'human' as const,
            ...(maybeAnnotationId ? { externalRef: maybeAnnotationId } : {}),
            createdAt: now,
            updatedAt: now,
          };
          await syncUtteranceTextToSegmentationV2(db, newUtterance, doc);
        }
      }

      let tierCount = 0;
      let skippedIndependentTierSegmentCount = 0;
      // 包含自动创建的转写层 | Include auto-created transcription layer
      const existingTrcLayers = [
        ...layers.filter((l) => l.layerType === 'transcription'),
        ...(autoCreatedLayerKey && effectiveTranscriptionLayerId
          ? [{ key: autoCreatedLayerKey, id: effectiveTranscriptionLayerId }]
          : []),
      ];

      if (additionalTiers.size > 0 && existingTrcLayers.length === 0) {
        console.warn('[Import] 跳过翻译层导入：无转写层存在');
      }

      // 已有翻译层索引（按 eng name 去重） | Index existing translation layers by eng name
      const existingTrlByName = new Map(
        layers
          .filter((l) => l.layerType === 'translation')
          .map((l) => {
            const engName = typeof l.name === 'object' && l.name !== null ? (l.name as Record<string, string>).eng ?? '' : '';
            return [engName.toLocaleLowerCase('en'), l] as const;
          })
          .filter(([k]) => k.length > 0),
      );

      // 独立转写层索引（按英文名/key）——用于非 EAF 导入时直接恢复 segment 边界
      // Index for independent transcription layers (by eng name / key) — restores segment boundaries on non-EAF import
      const existingIndepTrcLayersByName = new Map<string, string>(); // name/key → layerId
      for (const l of layers) {
        if (
          l.layerType === 'transcription'
          && l.constraint === 'independent_boundary'
        ) {
          const engName = typeof l.name === 'object' && l.name !== null ? (l.name as Record<string, string>).eng ?? '' : '';
          if (engName) existingIndepTrcLayersByName.set(engName.toLocaleLowerCase('en'), l.id);
          if (l.key) existingIndepTrcLayersByName.set(l.key.toLocaleLowerCase('en'), l.id);
        }
      }

      for (const [tierName, annotations] of additionalTiers) {
        if (annotations.length === 0) continue;
        if (existingTrcLayers.length === 0) continue;
        const tierIdentityMeta = importedTierMetadata.get(tierName);

        // 优先：若 tier 匹配已有独立转写层，直接写该层的 canonical segment graph（无需 utterance 时间对齐匹配）
        // Priority: if tier matches an existing independent transcription layer, write that layer's canonical segment graph directly (no utterance time-proximity matching needed).
        const humanizedTierForLookup = humanizeTierName(tierName).toLocaleLowerCase('en');
        const indepLayerId =
          existingIndepTrcLayersByName.get(tierName.toLocaleLowerCase('en'))
          ?? existingIndepTrcLayersByName.get(humanizedTierForLookup);
        if (indepLayerId) {
          const firstUtt = insertedUtterances[0];
          const importMediaId = mediaId ?? firstUtt?.utterance.mediaId;
          const importTextId = firstUtt?.utterance.textId ?? textId;
          if (!importMediaId) {
            skippedIndependentTierSegmentCount += annotations.filter((ann) => ann.text.trim()).length;
            console.warn('[Import] 跳过独立转写层导入：缺少媒体，无法恢复 segment', {
              tierName,
              layerId: indepLayerId,
              annotationCount: annotations.length,
            });
            continue;
          }
          for (const ann of annotations) {
            if (!ann.text.trim()) continue;
            const annStart = Number(ann.startTime.toFixed(3));
            const annEnd = Number(ann.endTime.toFixed(3));
            if (annEnd - annStart < 0.01) continue;
            const transformedAnnText = await transformImportedText({
              text: ann.text,
              ...(tierIdentityMeta?.orthographyId !== undefined ? { sourceOrthographyId: tierIdentityMeta.orthographyId } : {}),
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

        // 从解析结果推断翻译语言 | Infer translation language from parsed result
        const tierLang = tierIdentityMeta?.languageId
          ?? eafResult?.tierLocales?.get(tierName)
          ?? flexResult?.glossLanguage
          ?? 'und';

        // 去重：按名称匹配已有翻译层 | Dedup: reuse existing layer by name match
        const humanizedName = humanizeTierName(tierName);
        const dbResolvedName = resolveDbLanguageName(tierName)
          ?? resolveDbLanguageName(tierLang);
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
          const humanizedTierName = humanizeTierName(tierName);
          const trlDisplayName = resolveLayerDisplayName([tierLang, tierName], humanizedTierName);
          const langLabel = trlDisplayName.label;
          const eafTrlLangLabel = resolveEafLanguageLabel(tierLang)
            ?? resolveEafLanguageLabel(tierName);
          const key = eafResult
            ? withEafKeyMeta(baseKey, {
              tierId: tierName,
              ...(eafTrlLangLabel ? { langLabel: eafTrlLangLabel } : {}),
            })
            : baseKey;
          // 从 EAF tierConstraints 获取约束信息 | Get constraint info from EAF tierConstraints
          const eafTierConstraint = eafResult?.tierConstraints?.get(tierName);
          const parentTierId = eafTierConstraint?.parentTierId;
          const mappedParentLayerId = parentTierId ? tierNameToLayerId.get(parentTierId) : undefined;
          const fallbackParentLayerId = eafTierConstraint
            && eafTierConstraint.constraint !== 'independent_boundary'
            ? (existingTrcLayers[existingTrcLayers.length - 1]?.id ?? effectiveTranscriptionLayerId)
            : undefined;
          const parentLayerId = mappedParentLayerId ?? fallbackParentLayerId;
          
          const newLayer: LayerDocType = {
            id: layerId,
            textId,
            key,
            name: { eng: langLabel, zho: langLabel },
            layerType: 'translation' as const,
            languageId: tierLang,
            ...(tierIdentityMeta?.orthographyId ? { orthographyId: tierIdentityMeta.orthographyId } : {}),
            modality: 'text' as const,
            acceptsAudio: false,
            sortOrder: tierCount + 1,
            ...(eafTierConstraint ? { constraint: eafTierConstraint.constraint } : {}),
            ...(parentLayerId ? { parentLayerId } : {}),
            createdAt: now,
            updatedAt: now,
          };
          await LayerTierUnifiedService.createLayer(newLayer);
          rememberLayer(newLayer);
          
          // Add to tier name mapping for potential parent reference by subsequent tiers | 添加到 tier 名称映射（用于后续层的父引用）
          tierNameToLayerId.set(tierName, layerId);
          
          await writeImportLayerNameAudit({
            layerId,
            displayName: langLabel,
            source: trlDisplayName.source,
            languageId: tierLang,
            tierName,
            ...(trlDisplayName.matchedTag ? { matchedTag: trlDisplayName.matchedTag } : {}),
          });

          for (const trc of existingTrcLayers) {
            await db.collections.layer_links.insert({
              id: newId('link'),
              transcriptionLayerKey: trc.key,
              layerId: layerId,
              linkType: 'free',
              isPreferred: false,
              createdAt: now,
            });
          }
        }

        for (const ann of annotations) {
          const annStart = Number(ann.startTime.toFixed(3));
          const annEnd = Number(ann.endTime.toFixed(3));
          const match = insertedUtterances.find(
            (u) => Math.abs(u.startTime - annStart) < 0.05 && Math.abs(u.endTime - annEnd) < 0.05,
          );
          if (match && ann.text.trim()) {
            const transformedAnnText = await transformImportedText({
              text: ann.text,
              ...(tierIdentityMeta?.orthographyId !== undefined ? { sourceOrthographyId: tierIdentityMeta.orthographyId } : {}),
              targetLayerId: layerId,
            });
            const doc: UtteranceTextDocType = {
              id: newId('utr'),
              utteranceId: match.id,
              layerId: layerId,
              modality: 'text' as const,
              text: transformedAnnText,
              sourceType: 'human' as const,
              ...('annotationId' in ann && typeof ann.annotationId === 'string' ? { externalRef: ann.annotationId } : {}),
              createdAt: now,
              updatedAt: now,
            };
            await syncUtteranceTextToSegmentationV2(db, match.utterance, doc);
          }
        }
      }

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
        console.warn('[Import] 层约束校验发现问题 | Layer constraint validation found issues', layerConstraintIssues);
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
        actionLabel: '导入文件',
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
  }, [activeTextId, getActiveTextId, selectedUtteranceMedia, loadSnapshot, locale, setSaveState, defaultTranscriptionLayerId, layers, normalizeSpeakerLookupKey]);

  return {
    importFileRef,
    exportMenuRef,
    showExportMenu,
    setShowExportMenu,
    handleExportEaf,
    handleExportTextGrid,
    handleExportTrs,
    handleExportFlextext,
    handleExportToolbox,
    handleExportJyt,
    handleExportJym,
    handleImportFile,
  };
}
