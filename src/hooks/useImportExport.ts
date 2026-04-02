import { useCallback, useMemo, useRef, useState } from 'react';
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
import { exportToEaf, downloadEaf } from '../services/EafService';
import { exportToTextGrid, downloadTextGrid } from '../services/TextGridService';
import { exportToTrs, downloadTrs } from '../services/TranscriberService';
import { exportToFlextext, downloadFlextext } from '../services/FlexService';
import { exportToToolbox, downloadToolbox } from '../services/ToolboxService';
import { downloadJieyuArchive } from '../services/JymService';
import { t, useLocale } from '../i18n';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';
import { useOrthographies } from './useOrthographies';
import { applyOrthographyTransformIfNeeded } from '../utils/orthographyRuntime';
import { createImportExportImportHandlers } from './useImportExport.importHandlers';

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

export function useImportExport(input: UseImportExportInput) {
  const locale = useLocale();
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

  const { previewProjectArchiveImport, importProjectArchive, handleImportFile } = useMemo(() => (
    createImportExportImportHandlers({
      activeTextId,
      getActiveTextId,
      selectedUtteranceMedia,
      layers,
      defaultTranscriptionLayerId,
      loadSnapshot,
      setSaveState,
      locale,
      normalizeSpeakerLookupKey,
    })
  ), [
    activeTextId,
    defaultTranscriptionLayerId,
    getActiveTextId,
    layers,
    loadSnapshot,
    locale,
    normalizeSpeakerLookupKey,
    selectedUtteranceMedia,
    setSaveState,
  ]);

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
