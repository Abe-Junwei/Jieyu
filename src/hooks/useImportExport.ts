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
import { t, useLocale } from '../i18n';
import { useOrthographies } from './useOrthographies';

type ExportSupportModules = {
  layerSegmentQueryService: typeof import('../services/LayerSegmentQueryService');
  orthographyRuntime: typeof import('../utils/orthographyRuntime');
};

export interface UseImportExportInput {
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

function loadCachedModule<T>(
  ref: React.MutableRefObject<Promise<T> | null>,
  importer: () => Promise<T>,
): Promise<T> {
  if (!ref.current) {
    ref.current = importer();
  }
  return ref.current;
}

export function useImportExport(input: UseImportExportInput) {
  const locale = useLocale();
  const eafServiceModuleRef = useRef<Promise<typeof import('../services/EafService')> | null>(null);
  const textGridServiceModuleRef = useRef<Promise<typeof import('../services/TextGridService')> | null>(null);
  const transcriberServiceModuleRef = useRef<Promise<typeof import('../services/TranscriberService')> | null>(null);
  const flexServiceModuleRef = useRef<Promise<typeof import('../services/FlexService')> | null>(null);
  const toolboxServiceModuleRef = useRef<Promise<typeof import('../services/ToolboxService')> | null>(null);
  const exportSupportModulesRef = useRef<Promise<ExportSupportModules> | null>(null);
  const archiveExportModuleRef = useRef<Promise<typeof import('../services/JymService')> | null>(null);
  const archiveHandlersModuleRef = useRef<Promise<typeof import('./useImportExport.archiveHandlers')> | null>(null);
  const importHandlersModuleRef = useRef<Promise<typeof import('./useImportExport.importHandlers')> | null>(null);
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

  const loadEafService = useCallback(() => loadCachedModule(eafServiceModuleRef, () => import('../services/EafService')), []);

  const loadTextGridService = useCallback(() => loadCachedModule(textGridServiceModuleRef, () => import('../services/TextGridService')), []);

  const loadTranscriberService = useCallback(() => loadCachedModule(transcriberServiceModuleRef, () => import('../services/TranscriberService')), []);

  const loadFlexService = useCallback(() => loadCachedModule(flexServiceModuleRef, () => import('../services/FlexService')), []);

  const loadToolboxService = useCallback(() => loadCachedModule(toolboxServiceModuleRef, () => import('../services/ToolboxService')), []);

  const loadExportSupportModules = useCallback(() => {
    return loadCachedModule(exportSupportModulesRef, () => {
      return Promise.all([
        import('../services/LayerSegmentQueryService'),
        import('../utils/orthographyRuntime'),
      ]).then(([
        layerSegmentQueryService,
        orthographyRuntime,
      ]) => ({
        layerSegmentQueryService,
        orthographyRuntime,
      }));
    });
  }, []);

  const loadArchiveExportModule = () => loadCachedModule(archiveExportModuleRef, () => import('../services/JymService'));

  const loadArchiveHandlersModule = useCallback(async () => {
    if (!archiveHandlersModuleRef.current) {
      archiveHandlersModuleRef.current = import('./useImportExport.archiveHandlers');
    }
    return archiveHandlersModuleRef.current;
  }, []);

  const loadImportHandlersModule = useCallback(async () => {
    if (!importHandlersModuleRef.current) {
      importHandlersModuleRef.current = import('./useImportExport.importHandlers');
    }
    return importHandlersModuleRef.current;
  }, []);

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

    const { layerSegmentQueryService } = await loadExportSupportModules();

    const segMap = new Map<string, import('../db').LayerSegmentDocType[]>();
    const contentMap = new Map<string, Map<string, import('../db').LayerSegmentContentDocType>>();

    for (const layer of targetLayers) {
      const orderedSegments = await layerSegmentQueryService.LayerSegmentQueryService.listSegmentsByLayerMedia(layer.id, mediaId);
      if (orderedSegments.length === 0) continue;
      segMap.set(layer.id, orderedSegments);

      const segmentIds = orderedSegments.map((segment) => segment.id);
      const mergedContents = await layerSegmentQueryService.LayerSegmentQueryService.listSegmentContentsBySegmentIds(segmentIds, {
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
  }, [loadExportSupportModules]);

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
    const { orthographyRuntime } = await loadExportSupportModules();
    const nextUtterances = await Promise.all(currentUtterances.map(async (utterance) => {
      if (defaultLayerTextUtteranceIds.has(utterance.id)) return utterance;
      const legacyText = utterance.transcription?.default ?? '';
      if (!legacyText.trim()) return utterance;

      let transformedText = transformedTextCache.get(legacyText);
      if (transformedText === undefined) {
        transformedText = (await orthographyRuntime.applyOrthographyBridgeIfNeeded({
          text: legacyText,
          sourceOrthographyId,
          targetOrthographyId,
          ...(defaultLayer?.bridgeId ? { bridgeId: defaultLayer.bridgeId } : {}),
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
  }, [loadExportSupportModules, loadProjectPrimaryOrthographyId, translations]);

  const handleExportEaf = useCallback(async () => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const eafService = await loadEafService();
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
    const xml = eafService.exportToEaf({
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
    eafService.downloadEaf(xml, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.eaf') });
    setShowExportMenu(false);
  }, [anchors, buildOrthographyAwareExportUtterances, defaultTranscriptionLayerId, fetchUtteranceNotes, layers, loadEafService, loadSegmentExportDataForLayers, orthographies, resolveRelevantExportSpeakerIds, selectedUtteranceMedia, setSaveState, translations, utterancesOnCurrentMedia]);

  const handleExportTextGrid = useCallback(async () => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const textGridService = await loadTextGridService();
    const userNotes = await fetchUtteranceNotes(utterancesOnCurrentMedia.map((u) => u.id));
    const exportData = (await loadSegmentExportData(utterancesOnCurrentMedia[0]?.mediaId)) as any;
    const segmentsByLayer = exportData?.segmentsByLayer;
    const segmentContents = exportData?.segmentContents;
    const defaultTrcLayer = layers.find((layer) => layer.id === defaultTranscriptionLayerId)
      ?? layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault)
      ?? layers.find((layer) => layer.layerType === 'transcription');
    const exportUtterances = await buildOrthographyAwareExportUtterances(utterancesOnCurrentMedia, defaultTrcLayer);
    const tg = textGridService.exportToTextGrid({
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
    textGridService.downloadTextGrid(tg, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.textgrid') });
    setShowExportMenu(false);
  }, [buildOrthographyAwareExportUtterances, defaultTranscriptionLayerId, fetchUtteranceNotes, layers, loadSegmentExportData, loadTextGridService, selectedUtteranceMedia, setSaveState, translations, utterancesOnCurrentMedia]);

  const handleExportTrs = useCallback(async () => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const transcriberService = await loadTranscriberService();
    const transcriptionLayer = layers.find((layer) => layer.id === defaultTranscriptionLayerId)
      ?? layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault)
      ?? layers.find((layer) => layer.layerType === 'transcription');
    const exportUtterances = await buildOrthographyAwareExportUtterances(utterancesOnCurrentMedia, transcriptionLayer);
    const trs = transcriberService.exportToTrs({
      utterances: exportUtterances,
      orthographies,
      ...(transcriptionLayer !== undefined ? { transcriptionLayer } : {}),
    });
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'export';
    transcriberService.downloadTrs(trs, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.trs') });
    setShowExportMenu(false);
  }, [buildOrthographyAwareExportUtterances, defaultTranscriptionLayerId, layers, loadTranscriberService, orthographies, selectedUtteranceMedia, setSaveState, utterancesOnCurrentMedia]);

  const handleExportFlextext = useCallback(async () => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const flexService = await loadFlexService();
    const exportData2 = (await loadSegmentExportData(utterancesOnCurrentMedia[0]?.mediaId)) as any;
    const segmentsByLayer = exportData2?.segmentsByLayer;
    const segmentContents = exportData2?.segmentContents;
    const defaultTrcLayer = layers.find((layer) => layer.id === defaultTranscriptionLayerId)
      ?? layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault)
      ?? layers.find((layer) => layer.layerType === 'transcription');
    const exportUtterances = await buildOrthographyAwareExportUtterances(utterancesOnCurrentMedia, defaultTrcLayer);
    const flex = flexService.exportToFlextext({
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
    flexService.downloadFlextext(flex, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.flextext') });
    setShowExportMenu(false);
  }, [buildOrthographyAwareExportUtterances, defaultTranscriptionLayerId, layers, loadFlexService, loadSegmentExportData, selectedUtteranceMedia, setSaveState, translations, utterancesOnCurrentMedia]);

  const handleExportToolbox = useCallback(async () => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const toolboxService = await loadToolboxService();
    const exportData3 = (await loadSegmentExportData(utterancesOnCurrentMedia[0]?.mediaId)) as any;
    const segmentsByLayer = exportData3?.segmentsByLayer;
    const segmentContents = exportData3?.segmentContents;
    const defaultTrcLayer = layers.find((layer) => layer.id === defaultTranscriptionLayerId)
      ?? layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault)
      ?? layers.find((layer) => layer.layerType === 'transcription');
    const exportUtterances = await buildOrthographyAwareExportUtterances(utterancesOnCurrentMedia, defaultTrcLayer);
    const toolbox = toolboxService.exportToToolbox({
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
    toolboxService.downloadToolbox(toolbox, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.toolbox') });
    setShowExportMenu(false);
  }, [buildOrthographyAwareExportUtterances, defaultTranscriptionLayerId, layers, loadSegmentExportData, loadToolboxService, selectedUtteranceMedia, setSaveState, translations, utterancesOnCurrentMedia]);

  const handleExportJyt = useCallback(async () => {
    const jymService = await loadArchiveExportModule();
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'jieyu-project';
    await jymService.downloadJieyuArchive('jyt', baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.jyt') });
    setShowExportMenu(false);
  }, [loadArchiveExportModule, selectedUtteranceMedia, setSaveState]);

  const handleExportJym = useCallback(async () => {
    const jymService = await loadArchiveExportModule();
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'jieyu-project';
    await jymService.downloadJieyuArchive('jym', baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.jym') });
    setShowExportMenu(false);
  }, [loadArchiveExportModule, selectedUtteranceMedia, setSaveState]);

  const previewProjectArchiveImport = useCallback(async (file: File) => {
    const archiveHandlersModule = await loadArchiveHandlersModule();
    const { previewProjectArchiveImport: previewImport } = archiveHandlersModule.createImportExportArchiveHandlers({
      activeTextId,
      loadSnapshot,
      locale,
      setSaveState,
    });
    return previewImport(file);
  }, [activeTextId, loadArchiveHandlersModule, loadSnapshot, locale, setSaveState]);

  const importProjectArchive = useCallback(async (file: File, strategy: import('../db').ImportConflictStrategy) => {
    const archiveHandlersModule = await loadArchiveHandlersModule();
    const { importProjectArchive: importArchive } = archiveHandlersModule.createImportExportArchiveHandlers({
      activeTextId,
      loadSnapshot,
      locale,
      setSaveState,
    });
    return importArchive(file, strategy);
  }, [activeTextId, loadArchiveHandlersModule, loadSnapshot, locale, setSaveState]);

  const handleImportFile = useCallback(async (
    file: File,
    importWriteStrategy?: import('./useImportExport.annotationImport').AnnotationImportBridgeStrategy,
  ) => {
    const importHandlersModule = await loadImportHandlersModule();
    const { handleImportFile: importFile } = importHandlersModule.createImportExportImportHandlers({
      activeTextId,
      getActiveTextId,
      selectedUtteranceMedia,
      layers,
      defaultTranscriptionLayerId,
      loadSnapshot,
      setSaveState,
      locale,
      normalizeSpeakerLookupKey,
    });
    return importFile(file, importWriteStrategy);
  }, [activeTextId, defaultTranscriptionLayerId, getActiveTextId, layers, loadImportHandlersModule, loadSnapshot, locale, normalizeSpeakerLookupKey, selectedUtteranceMedia, setSaveState]);

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
    previewProjectArchiveImport,
    importProjectArchive,
    handleImportFile,
  };
}
