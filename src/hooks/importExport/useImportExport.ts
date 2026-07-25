import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDb } from '../../db';
import { useClickOutside } from '../ui/useClickOutside';
import type {
  AnchorDocType,
  LayerUnitDocType,
  MediaItemDocType,
  LayerDocType,
  LayerUnitContentDocType,
} from '../../db';
import type { SaveState } from '../useTranscriptionData';
import { LinguisticService } from '../../services/LinguisticService';
import { t, tf, useLocale } from '../../i18n';
import { createLogger } from '../../observability/logger';
import { recordFullProjectArchiveExportCompleted } from '../../utils/backupExportReminderState';
import { useOrthographies } from '../orthography/useOrthographies';
import { isImportMismatchRequiresAckError } from '../../utils/timelineImportMismatchAckError';
import type { TimelineImportMismatchNotice } from '../../utils/timelineImportMismatch';
import type { AnnotationImportBridgeStrategy } from './useImportExport.annotationImport';

type ExportSupportModules = {
  layerSegmentQueryService: typeof import('../../services/LayerSegmentQueryService');
  orthographyRuntime: typeof import('../../utils/orthographyRuntime');
};

const log = createLogger('useImportExport');

function hasSegmentExportRows(exportData: { segmentsByLayer?: Map<string, unknown[]> }): boolean {
  const segments = exportData.segmentsByLayer;
  if (!segments || segments.size === 0) return false;
  for (const rows of segments.values()) {
    if (rows.length > 0) return true;
  }
  return false;
}

function normalizeSpeakerLookupKey(value: string | undefined) {
  return value?.trim().toLocaleLowerCase('zh-Hans-CN') ?? '';
}

function resolveRelevantExportSpeakerIds(
  currentUnits: LayerUnitDocType[],
  layerSegments?: Map<string, LayerUnitDocType[]>,
) {
  const ids = new Set<string>();
  for (const unit of currentUnits) {
    const speakerId = unit.speakerId?.trim();
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
}

function collectExportUnitIds(
  primaryUnits: Array<{ id: string }>,
  layerSegments?: Map<string, LayerUnitDocType[]>,
): string[] {
  const ids = new Set<string>(primaryUnits.map((unit) => unit.id));
  if (layerSegments) {
    for (const segments of layerSegments.values()) {
      for (const segment of segments) {
        if (segment.id) ids.add(segment.id);
      }
    }
  }
  return [...ids];
}

function loadArchiveHandlersModule(
  ref: React.MutableRefObject<Promise<typeof import('./useImportExport.archiveHandlers')> | null>,
) {
  if (!ref.current) {
    ref.current = import('./useImportExport.archiveHandlers');
  }
  return ref.current;
}

function loadImportHandlersModule(
  ref: React.MutableRefObject<Promise<typeof import('./useImportExport.importHandlers')> | null>,
) {
  if (!ref.current) {
    ref.current = import('./useImportExport.importHandlers');
  }
  return ref.current;
}

export interface UseImportExportInput {
  activeTextId: string | null;
  getActiveTextId: () => Promise<string | null>;
  selectedUnitMedia?: MediaItemDocType | undefined;
  /**
   * 时间轴行解析出的媒体（与 `segmentScopeMediaId` 一致时优先）：导出默认文件名、EAF `mediaItem` 等；缺省回退 `selectedUnitMedia`。
   */
  activeTimelineMediaItem?: MediaItemDocType | undefined;
  /**
   * 与 `resolveSegmentScopeMediaId` 同源：导出/导入写 segment 图时按此 media 查询，避免仅用 `unitsOnCurrentMedia[0]` 与读模型错位。
   */
  segmentScopeMediaId?: string | undefined;
  unitsOnCurrentMedia: LayerUnitDocType[];
  anchors: AnchorDocType[];
  layers: LayerDocType[];
  translations: LayerUnitContentDocType[];
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
  const eafServiceModuleRef = useRef<Promise<typeof import('../../services/EafService')> | null>(
    null,
  );
  const textGridServiceModuleRef = useRef<Promise<
    typeof import('../../services/TextGridService')
  > | null>(null);
  const transcriberServiceModuleRef = useRef<Promise<
    typeof import('../../services/TranscriberService')
  > | null>(null);
  const flexServiceModuleRef = useRef<Promise<typeof import('../../services/FlexService')> | null>(
    null,
  );
  const toolboxServiceModuleRef = useRef<Promise<
    typeof import('../../services/ToolboxService')
  > | null>(null);
  const exportSupportModulesRef = useRef<Promise<ExportSupportModules> | null>(null);
  const archiveExportModuleRef = useRef<Promise<typeof import('../../services/JymService')> | null>(
    null,
  );
  const archiveHandlersModuleRef = useRef<Promise<
    typeof import('./useImportExport.archiveHandlers')
  > | null>(null);
  const importHandlersModuleRef = useRef<Promise<
    typeof import('./useImportExport.importHandlers')
  > | null>(null);
  const {
    activeTextId,
    getActiveTextId,
    selectedUnitMedia,
    activeTimelineMediaItem,
    segmentScopeMediaId,
    unitsOnCurrentMedia,
    anchors,
    layers,
    translations,
    defaultTranscriptionLayerId,
    loadSnapshot,
    setSaveState,
  } = input;

  const [pendingAnnotationImport, setPendingAnnotationImport] = useState<{
    file: File;
    fileName: string;
    strategy?: AnnotationImportBridgeStrategy;
    notices: TimelineImportMismatchNotice[];
  } | null>(null);
  const [annotationImportMismatchBusy, setAnnotationImportMismatchBusy] = useState(false);

  const segmentExportMediaId = useMemo(() => {
    const fromScope = segmentScopeMediaId?.trim() ?? '';
    if (fromScope.length > 0) return fromScope;
    const fromUnit = unitsOnCurrentMedia[0]?.mediaId?.trim() ?? '';
    if (fromUnit.length > 0) return fromUnit;
    return activeTimelineMediaItem?.id?.trim() ?? selectedUnitMedia?.id?.trim() ?? '';
  }, [
    segmentScopeMediaId,
    unitsOnCurrentMedia,
    activeTimelineMediaItem?.id,
    selectedUnitMedia?.id,
  ]);

  const exportNamingMediaItem = useMemo(
    () => activeTimelineMediaItem ?? selectedUnitMedia,
    [activeTimelineMediaItem, selectedUnitMedia],
  );

  const segmentExportScopeEmptyDiagLoggedRef = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const hasTimeAlignedLayers = layers.some(
      (l) =>
        (l.layerType === 'translation' &&
          (l.constraint === 'independent_boundary' || l.constraint === 'time_subdivision')) ||
        (l.layerType === 'transcription' &&
          (l.constraint === 'independent_boundary' || l.constraint === 'time_subdivision')),
    );
    if (!hasTimeAlignedLayers) return;
    if ((segmentExportMediaId?.trim() ?? '').length > 0) return;
    if (segmentExportScopeEmptyDiagLoggedRef.current) return;
    segmentExportScopeEmptyDiagLoggedRef.current = true;
    log.debug('segment export media id empty while time-aligned layers exist', {
      unitsOnCurrentMediaCount: unitsOnCurrentMedia.length,
    });
  }, [layers, segmentExportMediaId, unitsOnCurrentMedia.length]);
  const orthographyLanguageIds = Array.from(
    new Set(
      layers
        .map((layer) => layer.languageId)
        .filter((languageId): languageId is string => Boolean(languageId)),
    ),
  );
  const orthographies = useOrthographies(orthographyLanguageIds);

  const importFileRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const confirmArchiveExport = useCallback(
    (kind: 'jyt' | 'jym') => {
      if (typeof window === 'undefined') return {};

      const confirmed = window.confirm(
        tf(locale, 'transcription.importExport.archiveExportConfirm', {
          kind: kind.toUpperCase(),
        }),
      );
      if (!confirmed) return null;

      const wantsEncryption = window.confirm(
        t(locale, 'transcription.importExport.archiveExportEncryptPrompt'),
      );
      if (!wantsEncryption) return {};

      const passwordInput = window.prompt(
        t(locale, 'transcription.importExport.archivePasswordPrompt'),
      );
      if (passwordInput == null) return null;

      const password = passwordInput.trim();
      if (!password) {
        setSaveState({
          kind: 'error',
          message: t(locale, 'transcription.importExport.archivePasswordRequired'),
        });
        return null;
      }

      const hintInput = window.prompt(
        t(locale, 'transcription.importExport.archivePasswordHintPrompt'),
      );
      const hint = hintInput?.trim();

      return {
        encryption: {
          password,
          ...(hint ? { passwordHint: hint } : {}),
        },
      };
    },
    [locale, setSaveState],
  );

  const serviceLoaders = useMemo(
    () => ({
      loadEafService: () =>
        loadCachedModule(eafServiceModuleRef, () => import('../../services/EafService')),
      loadTextGridService: () =>
        loadCachedModule(textGridServiceModuleRef, () => import('../../services/TextGridService')),
      loadTranscriberService: () =>
        loadCachedModule(
          transcriberServiceModuleRef,
          () => import('../../services/TranscriberService'),
        ),
      loadFlexService: () =>
        loadCachedModule(flexServiceModuleRef, () => import('../../services/FlexService')),
      loadToolboxService: () =>
        loadCachedModule(toolboxServiceModuleRef, () => import('../../services/ToolboxService')),
      loadExportSupportModules: () =>
        loadCachedModule(exportSupportModulesRef, () =>
          Promise.all([
            import('../../services/LayerSegmentQueryService'),
            import('../../utils/orthographyRuntime'),
          ]).then(([layerSegmentQueryService, orthographyRuntime]) => ({
            layerSegmentQueryService,
            orthographyRuntime,
          })),
        ),
    }),
    [],
  );

  const loadArchiveExportModule = () =>
    loadCachedModule(archiveExportModuleRef, () => import('../../services/JymService'));

  // Use centralized click-outside pattern to avoid race condition with click handlers
  useClickOutside(
    exportMenuRef as React.RefObject<HTMLElement | null>,
    () => setShowExportMenu(false),
    { closeOnEscape: true },
  );

  const fetchUnitNotes = useCallback(async (uttIds: string[]) => {
    if (uttIds.length === 0) return [];
    const db = await getDb();
    return db.dexie.user_notes
      .where('[targetType+targetId]')
      .anyOf(uttIds.map((id) => ['unit', id]))
      .toArray();
  }, []);

  const loadSegmentExportDataForLayers = useCallback(
    async (
      targetLayers: LayerDocType[],
      mediaId: string | undefined,
    ): Promise<{
      segmentsByLayer?: Map<string, LayerUnitDocType[]>;
      segmentContents?: Map<string, Map<string, LayerUnitContentDocType>>;
    }> => {
      if (!mediaId || targetLayers.length === 0) return {};

      const { layerSegmentQueryService } = await serviceLoaders.loadExportSupportModules();

      const segMap = new Map<string, import('../../db').LayerUnitDocType[]>();
      const contentMap = new Map<string, Map<string, import('../../db').LayerUnitContentDocType>>();

      for (const layer of targetLayers) {
        const orderedSegments =
          await layerSegmentQueryService.LayerSegmentQueryService.listSegmentsByLayerMedia(
            layer.id,
            mediaId,
          );
        if (orderedSegments.length === 0) continue;
        segMap.set(layer.id, orderedSegments);

        const segmentIds = orderedSegments.map((segment) => segment.id);
        const mergedContents =
          await layerSegmentQueryService.LayerSegmentQueryService.listSegmentContentsBySegmentIds(
            segmentIds,
            {
              layerId: layer.id,
              modality: 'text',
            },
          );

        const mergedContentMap = new Map<string, import('../../db').LayerUnitContentDocType>();
        for (const content of mergedContents) {
          const segmentId = content.segmentId ?? content.unitId;
          if (!segmentId) continue;
          mergedContentMap.set(segmentId, content);
        }

        if (mergedContentMap.size > 0) {
          contentMap.set(layer.id, mergedContentMap);
        }
      }

      return {
        ...(segMap.size > 0
          ? { segmentsByLayer: segMap as Map<string, import('../../db').LayerUnitDocType[]> }
          : {}),
        ...(contentMap.size > 0
          ? {
              segmentContents: contentMap as Map<
                string,
                Map<string, import('../../db').LayerUnitContentDocType>
              >,
            }
          : {}),
      };
    },
    [serviceLoaders],
  );

  /** 加载所有具有 segment 约束的层的 segment 及内容（TextGrid/FLEx/Toolbox 导出共用）
   *  Load layers with segment constraints (independent_boundary / time_subdivision) — shared by TextGrid/FLEx/Toolbox export */
  const loadSegmentExportData = useCallback(
    async (
      mediaId: string | undefined,
    ): Promise<{
      segmentsByLayer?: Map<string, LayerUnitDocType[]>;
      segmentContents?: Map<string, Map<string, LayerUnitContentDocType>>;
    }> => {
      const segmentLayers = layers.filter(
        (l) => l.constraint === 'independent_boundary' || l.constraint === 'time_subdivision',
      );
      return loadSegmentExportDataForLayers(segmentLayers, mediaId);
    },
    [layers, loadSegmentExportDataForLayers],
  );

  const loadProjectPrimaryOrthographyId = useCallback(async () => {
    const textId = activeTextId ?? (await getActiveTextId());
    if (!textId) return undefined;
    const db = await getDb();
    const textRow = await db.dexie.texts?.get?.(textId);
    const metadata =
      textRow && typeof textRow === 'object'
        ? (textRow as { metadata?: { primaryOrthographyId?: unknown } }).metadata
        : undefined;
    return typeof metadata?.primaryOrthographyId === 'string' &&
      metadata.primaryOrthographyId.trim().length > 0
      ? metadata.primaryOrthographyId.trim()
      : undefined;
  }, [activeTextId, getActiveTextId]);

  const loadProjectTimelineMetadata = useCallback(async () => {
    const textId = activeTextId ?? (await getActiveTextId());
    if (!textId) return undefined;
    const db = await getDb();
    const textRow = await db.dexie.texts?.get?.(textId);
    const metadata =
      textRow && typeof textRow === 'object'
        ? (
            textRow as {
              metadata?: {
                timelineMode?: unknown;
                logicalDurationSec?: unknown;
                timebaseLabel?: unknown;
              };
            }
          ).metadata
        : undefined;
    const rawTimelineMode = metadata?.timelineMode;
    const timelineMode: 'document' | 'media' | undefined =
      rawTimelineMode === 'document' || rawTimelineMode === 'media' ? rawTimelineMode : undefined;
    const logicalDurationSec =
      typeof metadata?.logicalDurationSec === 'number' &&
      Number.isFinite(metadata.logicalDurationSec)
        ? metadata.logicalDurationSec
        : undefined;
    const timebaseLabel =
      typeof metadata?.timebaseLabel === 'string' && metadata.timebaseLabel.trim().length > 0
        ? metadata.timebaseLabel.trim()
        : undefined;
    if (!timelineMode && logicalDurationSec === undefined && !timebaseLabel) return undefined;
    return {
      ...(timelineMode ? { timelineMode } : {}),
      ...(logicalDurationSec !== undefined ? { logicalDurationSec } : {}),
      ...(timebaseLabel ? { timebaseLabel } : {}),
    };
  }, [activeTextId, getActiveTextId]);

  const buildOrthographyAwareExportUnits = useCallback(
    async (currentUnits: LayerUnitDocType[], defaultLayer: LayerDocType | undefined) => {
      const targetOrthographyId = defaultLayer?.orthographyId?.trim();
      if (!defaultLayer?.id || !targetOrthographyId) return currentUnits;

      const sourceOrthographyId = await loadProjectPrimaryOrthographyId();
      if (!sourceOrthographyId || sourceOrthographyId === targetOrthographyId) {
        return currentUnits;
      }

      const defaultLayerTextUnitIds = new Set(
        translations
          .filter(
            (item) =>
              item.layerId === defaultLayer.id &&
              item.modality === 'text' &&
              typeof item.text === 'string' &&
              item.text.trim().length > 0,
          )
          .map((item) => item.unitId),
      );

      let didChange = false;
      const transformedTextCache = new Map<string, string>();
      const { orthographyRuntime } = await serviceLoaders.loadExportSupportModules();
      const nextUnits = await Promise.all(
        currentUnits.map(async (unit) => {
          if (defaultLayerTextUnitIds.has(unit.id)) return unit;
          const legacyText = unit.transcription?.default ?? '';
          if (!legacyText.trim()) return unit;

          let transformedText = transformedTextCache.get(legacyText);
          if (transformedText === undefined) {
            transformedText = (
              await orthographyRuntime.applyOrthographyBridgeIfNeeded({
                text: legacyText,
                sourceOrthographyId,
                targetOrthographyId,
                ...(defaultLayer?.bridgeId ? { bridgeId: defaultLayer.bridgeId } : {}),
              })
            ).text;
            transformedTextCache.set(legacyText, transformedText);
          }

          if (transformedText === legacyText) return unit;
          didChange = true;
          return {
            ...unit,
            transcription: {
              ...(unit.transcription ?? {}),
              default: transformedText,
            },
          } as LayerUnitDocType;
        }),
      );

      return didChange ? nextUnits : currentUnits;
    },
    [serviceLoaders, loadProjectPrimaryOrthographyId, translations],
  );

  const exportMenuActions = useMemo(() => {
    const runExport = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (err) {
        log.error('export failed', { label, err });
        setSaveState({
          kind: 'error',
          message: tf(locale, 'transcription.importExport.exportFailed', {
            message: err instanceof Error ? err.message : String(err),
          }),
        });
      }
    };

    return {
      handleExportEaf: async () => {
        await runExport('eaf', async () => {
          const timeAlignedLayers = layers.filter(
            (l) =>
              (l.layerType === 'translation' &&
                (l.constraint === 'independent_boundary' || l.constraint === 'time_subdivision')) ||
              (l.layerType === 'transcription' &&
                (l.constraint === 'independent_boundary' || l.constraint === 'time_subdivision')),
          );
          const exportData = (await loadSegmentExportDataForLayers(
            timeAlignedLayers,
            segmentExportMediaId || undefined,
          )) as {
            segmentsByLayer?: Map<string, import('../../db').LayerUnitDocType[]>;
            segmentContents?: Map<string, Map<string, import('../../db').LayerUnitContentDocType>>;
          };
          if (unitsOnCurrentMedia.length === 0 && !hasSegmentExportRows(exportData)) return;
          const eafService = await serviceLoaders.loadEafService();
          const userNotes = await fetchUnitNotes(unitsOnCurrentMedia.map((u) => u.id));
          const defaultTrcLayer =
            layers.find((layer) => layer.id === defaultTranscriptionLayerId) ??
            layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault) ??
            layers.find((layer) => layer.layerType === 'transcription');
          // Query segments for time-aligned layers (translation + independent transcription)
          // 查询时间对齐层的 segment 数据（翻译层 + 独立转写层）
          const layerSegments = exportData.segmentsByLayer;
          const layerSegmentContents = exportData.segmentContents;
          const db = await getDb();
          const layerLinks =
            typeof db.dexie.layer_links?.toArray === 'function'
              ? await db.dexie.layer_links.toArray()
              : [];
          const relevantSpeakerIds = resolveRelevantExportSpeakerIds(
            unitsOnCurrentMedia,
            layerSegments,
          );
          const speakers =
            relevantSpeakerIds.size === 0
              ? []
              : (await db.dexie.speakers.toArray()).filter((speaker) =>
                  relevantSpeakerIds.has(speaker.id),
                );
          const exportUnits = await buildOrthographyAwareExportUnits(
            unitsOnCurrentMedia,
            defaultTrcLayer,
          );
          const tokens = await LinguisticService.units.listTokensByUnitIds(
            exportUnits.map((unit) => unit.id),
          );
          const morphemes = await LinguisticService.units.listMorphemesByTokenIds(
            tokens.map((token) => token.id),
          );
          const timelineMetadata = await loadProjectTimelineMetadata();
          const exportWarnings: Array<{ code: string }> = [];
          const xml = eafService.exportToEaf({
            ...(exportNamingMediaItem ? { mediaItem: exportNamingMediaItem } : {}),
            units: exportUnits,
            anchors,
            layers,
            layerLinks,
            orthographies,
            translations,
            userNotes,
            tokens,
            morphemes,
            ...(timelineMetadata ? { timelineMetadata } : {}),
            ...(layerSegments ? { layerSegments } : {}),
            ...(layerSegmentContents ? { layerSegmentContents } : {}),
            ...(defaultTranscriptionLayerId ? { defaultTranscriptionLayerId } : {}),
            speakers,
            onWarning: (warning) => {
              exportWarnings.push(warning);
            },
          });
          const baseName = exportNamingMediaItem
            ? exportNamingMediaItem.filename.replace(/\.[^.]+$/, '')
            : 'export';
          eafService.downloadEaf(xml, baseName);
          const multiHostWarningCount = exportWarnings.filter(
            (warning) => warning.code === 'translation-multi-host-lossy',
          ).length;
          const warningSuffix =
            multiHostWarningCount > 0
              ? ` ${tf(locale, 'transcription.importExport.exportDone.eafMultiHostWarning', { count: multiHostWarningCount })}`
              : '';
          setSaveState({
            kind: 'done',
            message:
              `${t(locale, 'transcription.importExport.exportDone.eaf')}${warningSuffix}`.trim(),
          });
          setShowExportMenu(false);
        });
      },

      handleExportTextGrid: async () => {
        await runExport('textgrid', async () => {
          const exportData = await loadSegmentExportData(segmentExportMediaId || undefined);
          if (unitsOnCurrentMedia.length === 0 && !hasSegmentExportRows(exportData)) return;
          const textGridService = await serviceLoaders.loadTextGridService();
          const userNotes = await fetchUnitNotes(unitsOnCurrentMedia.map((u) => u.id));
          const segmentsByLayer = exportData?.segmentsByLayer;
          const segmentContents = exportData?.segmentContents;
          const defaultTrcLayer =
            layers.find((layer) => layer.id === defaultTranscriptionLayerId) ??
            layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault) ??
            layers.find((layer) => layer.layerType === 'transcription');
          const exportUnits = await buildOrthographyAwareExportUnits(
            unitsOnCurrentMedia,
            defaultTrcLayer,
          );
          const timelineMetadata = await loadProjectTimelineMetadata();
          const tg = textGridService.exportToTextGrid({
            units: exportUnits,
            layers,
            orthographies,
            translations,
            userNotes,
            ...(timelineMetadata ? { timelineMetadata } : {}),
            ...(segmentsByLayer ? { segmentsByLayer } : {}),
            ...(segmentContents ? { segmentContents } : {}),
          });
          const baseName = exportNamingMediaItem
            ? exportNamingMediaItem.filename.replace(/\.[^.]+$/, '')
            : 'export';
          textGridService.downloadTextGrid(tg, baseName);
          setSaveState({
            kind: 'done',
            message: t(locale, 'transcription.importExport.exportDone.textgrid'),
          });
          setShowExportMenu(false);
        });
      },

      handleExportTrs: async () => {
        await runExport('trs', async () => {
          if (unitsOnCurrentMedia.length === 0) return;
          const transcriberService = await serviceLoaders.loadTranscriberService();
          const transcriptionLayer =
            layers.find((layer) => layer.id === defaultTranscriptionLayerId) ??
            layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault) ??
            layers.find((layer) => layer.layerType === 'transcription');
          const exportUnits = await buildOrthographyAwareExportUnits(
            unitsOnCurrentMedia,
            transcriptionLayer,
          );
          const timelineMetadata = await loadProjectTimelineMetadata();
          const relevantSpeakerIds = new Set(
            exportUnits
              .map((unit) => unit.speakerId)
              .filter((id): id is string => typeof id === 'string' && id.length > 0),
          );
          const db = await getDb();
          const speakers =
            relevantSpeakerIds.size === 0
              ? []
              : (await db.dexie.speakers.toArray())
                  .filter((speaker) => relevantSpeakerIds.has(speaker.id))
                  .map((speaker) => ({
                    id: speaker.id,
                    name: speaker.name,
                    ...(speaker.languageIds?.[0] ? { lang: speaker.languageIds[0] } : {}),
                    ...(speaker.dialect ? { dialect: speaker.dialect } : {}),
                    ...(speaker.accent ? { accent: speaker.accent } : {}),
                  }));
          const trs = transcriberService.exportToTrs({
            units: exportUnits,
            speakers,
            orthographies,
            translations,
            ...(timelineMetadata ? { timelineMetadata } : {}),
            ...(transcriptionLayer !== undefined ? { transcriptionLayer } : {}),
          });
          const baseName = exportNamingMediaItem
            ? exportNamingMediaItem.filename.replace(/\.[^.]+$/, '')
            : 'export';
          transcriberService.downloadTrs(trs, baseName);
          setSaveState({
            kind: 'done',
            message: t(locale, 'transcription.importExport.exportDone.trs'),
          });
          setShowExportMenu(false);
        });
      },

      handleExportFlextext: async () => {
        await runExport('flextext', async () => {
          const exportData2 = await loadSegmentExportData(segmentExportMediaId || undefined);
          if (unitsOnCurrentMedia.length === 0 && !hasSegmentExportRows(exportData2)) return;
          const flexService = await serviceLoaders.loadFlexService();
          const segmentsByLayer = exportData2?.segmentsByLayer;
          const segmentContents = exportData2?.segmentContents;
          const defaultTrcLayer =
            layers.find((layer) => layer.id === defaultTranscriptionLayerId) ??
            layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault) ??
            layers.find((layer) => layer.layerType === 'transcription');
          const exportUnits = await buildOrthographyAwareExportUnits(
            unitsOnCurrentMedia,
            defaultTrcLayer,
          );
          const tokens = await LinguisticService.units.listTokensByUnitIds(
            collectExportUnitIds(exportUnits, segmentsByLayer),
          );
          const morphemes = await LinguisticService.units.listMorphemesByTokenIds(
            tokens.map((token) => token.id),
          );
          const timelineMetadata = await loadProjectTimelineMetadata();
          const flex = flexService.exportToFlextext({
            units: exportUnits,
            layers,
            orthographies,
            translations,
            tokens,
            morphemes,
            ...(timelineMetadata ? { timelineMetadata } : {}),
            ...(segmentsByLayer ? { segmentsByLayer } : {}),
            ...(segmentContents ? { segmentContents } : {}),
          });
          const baseName = exportNamingMediaItem
            ? exportNamingMediaItem.filename.replace(/\.[^.]+$/, '')
            : 'export';
          flexService.downloadFlextext(flex, baseName);
          setSaveState({
            kind: 'done',
            message: t(locale, 'transcription.importExport.exportDone.flextext'),
          });
          setShowExportMenu(false);
        });
      },

      handleExportToolbox: async () => {
        await runExport('toolbox', async () => {
          const exportData3 = await loadSegmentExportData(segmentExportMediaId || undefined);
          if (unitsOnCurrentMedia.length === 0 && !hasSegmentExportRows(exportData3)) return;
          const toolboxService = await serviceLoaders.loadToolboxService();
          const segmentsByLayer = exportData3?.segmentsByLayer;
          const segmentContents = exportData3?.segmentContents;
          const defaultTrcLayer =
            layers.find((layer) => layer.id === defaultTranscriptionLayerId) ??
            layers.find((layer) => layer.layerType === 'transcription' && layer.isDefault) ??
            layers.find((layer) => layer.layerType === 'transcription');
          const exportUnits = await buildOrthographyAwareExportUnits(
            unitsOnCurrentMedia,
            defaultTrcLayer,
          );
          const tokens = await LinguisticService.units.listTokensByUnitIds(
            collectExportUnitIds(exportUnits, segmentsByLayer),
          );
          const morphemes = await LinguisticService.units.listMorphemesByTokenIds(
            tokens.map((token) => token.id),
          );
          const timelineMetadata = await loadProjectTimelineMetadata();
          const toolbox = toolboxService.exportToToolbox({
            units: exportUnits,
            layers,
            orthographies,
            translations,
            tokens,
            morphemes,
            ...(timelineMetadata ? { timelineMetadata } : {}),
            ...(segmentsByLayer ? { segmentsByLayer } : {}),
            ...(segmentContents ? { segmentContents } : {}),
          });
          const baseName = exportNamingMediaItem
            ? exportNamingMediaItem.filename.replace(/\.[^.]+$/, '')
            : 'export';
          toolboxService.downloadToolbox(toolbox, baseName);
          setSaveState({
            kind: 'done',
            message: t(locale, 'transcription.importExport.exportDone.toolbox'),
          });
          setShowExportMenu(false);
        });
      },

      handleExportJyt: async () => {
        await runExport('jyt', async () => {
          const jymService = await loadArchiveExportModule();
          const baseName = exportNamingMediaItem
            ? exportNamingMediaItem.filename.replace(/\.[^.]+$/, '')
            : 'jieyu-project';
          const exportOptions = confirmArchiveExport('jyt');
          if (exportOptions === null) {
            setShowExportMenu(false);
            return;
          }
          await jymService.downloadJieyuArchive('jyt', baseName, exportOptions);
          recordFullProjectArchiveExportCompleted();
          setSaveState({
            kind: 'done',
            message: exportOptions.encryption
              ? tf(locale, 'transcription.importExport.exportDone.archiveEncrypted', {
                  kind: 'JYT',
                })
              : t(locale, 'transcription.importExport.exportDone.jyt'),
          });
          setShowExportMenu(false);
        });
      },

      handleExportJym: async () => {
        await runExport('jym', async () => {
          const jymService = await loadArchiveExportModule();
          const baseName = exportNamingMediaItem
            ? exportNamingMediaItem.filename.replace(/\.[^.]+$/, '')
            : 'jieyu-project';
          const exportOptions = confirmArchiveExport('jym');
          if (exportOptions === null) {
            setShowExportMenu(false);
            return;
          }
          await jymService.downloadJieyuArchive('jym', baseName, exportOptions);
          recordFullProjectArchiveExportCompleted();
          setSaveState({
            kind: 'done',
            message: exportOptions.encryption
              ? tf(locale, 'transcription.importExport.exportDone.archiveEncrypted', {
                  kind: 'JYM',
                })
              : t(locale, 'transcription.importExport.exportDone.jym'),
          });
          setShowExportMenu(false);
        });
      },
    };
  }, [
    anchors,
    buildOrthographyAwareExportUnits,
    confirmArchiveExport,
    defaultTranscriptionLayerId,
    fetchUnitNotes,
    layers,
    loadProjectTimelineMetadata,
    loadSegmentExportData,
    loadSegmentExportDataForLayers,
    locale,
    orthographies,
    segmentExportMediaId,
    exportNamingMediaItem,
    serviceLoaders,
    setSaveState,
    translations,
    unitsOnCurrentMedia,
  ]);

  const archiveImportActions = useMemo(
    () => ({
      previewProjectArchiveImport: async (file: File) => {
        const archiveHandlersModule = await loadArchiveHandlersModule(archiveHandlersModuleRef);
        const { previewProjectArchiveImport: previewImport } =
          archiveHandlersModule.createImportExportArchiveHandlers({
            activeTextId,
            loadSnapshot,
            locale,
            setSaveState,
          });
        return previewImport(file);
      },
      importProjectArchive: async (
        file: File,
        strategy: import('../../db').ImportConflictStrategy,
      ) => {
        const archiveHandlersModule = await loadArchiveHandlersModule(archiveHandlersModuleRef);
        const { importProjectArchive: importArchive } =
          archiveHandlersModule.createImportExportArchiveHandlers({
            activeTextId,
            loadSnapshot,
            locale,
            setSaveState,
          });
        return importArchive(file, strategy);
      },
    }),
    [activeTextId, loadSnapshot, locale, setSaveState],
  );

  const handleImportFile = useCallback(
    async (
      file: File,
      importWriteStrategy?: import('./useImportExport.annotationImport').AnnotationImportBridgeStrategy,
    ) => {
      const importHandlersModule = await loadImportHandlersModule(importHandlersModuleRef);
      const { handleImportFile: importFile } =
        importHandlersModule.createImportExportImportHandlers({
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
        });
      try {
        return await importFile(file, importWriteStrategy);
      } catch (err) {
        if (isImportMismatchRequiresAckError(err)) {
          setPendingAnnotationImport({
            file,
            ...(importWriteStrategy !== undefined ? { strategy: importWriteStrategy } : {}),
            notices: [...err.notices],
            fileName: err.fileName,
          });
          return;
        }
        throw err;
      }
    },
    [
      activeTextId,
      activeTimelineMediaItem,
      defaultTranscriptionLayerId,
      getActiveTextId,
      layers,
      loadSnapshot,
      locale,
      segmentScopeMediaId,
      selectedUnitMedia,
      setSaveState,
    ],
  );

  const cancelAnnotationImportMismatch = useCallback(() => {
    setPendingAnnotationImport(null);
  }, []);

  const confirmAnnotationImportMismatch = useCallback(async () => {
    if (!pendingAnnotationImport) return;
    setAnnotationImportMismatchBusy(true);
    try {
      const importHandlersModule = await loadImportHandlersModule(importHandlersModuleRef);
      const { handleImportFile: importFile } =
        importHandlersModule.createImportExportImportHandlers({
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
        });
      await importFile(pendingAnnotationImport.file, pendingAnnotationImport.strategy, {
        mismatchAcknowledged: true,
      });
      setPendingAnnotationImport(null);
    } finally {
      setAnnotationImportMismatchBusy(false);
    }
  }, [
    activeTextId,
    activeTimelineMediaItem,
    defaultTranscriptionLayerId,
    getActiveTextId,
    layers,
    loadSnapshot,
    locale,
    pendingAnnotationImport,
    segmentScopeMediaId,
    selectedUnitMedia,
    setSaveState,
  ]);

  return {
    importFileRef,
    exportMenuRef,
    showExportMenu,
    setShowExportMenu,
    handleExportEaf: exportMenuActions.handleExportEaf,
    handleExportTextGrid: exportMenuActions.handleExportTextGrid,
    handleExportTrs: exportMenuActions.handleExportTrs,
    handleExportFlextext: exportMenuActions.handleExportFlextext,
    handleExportToolbox: exportMenuActions.handleExportToolbox,
    handleExportJyt: exportMenuActions.handleExportJyt,
    handleExportJym: exportMenuActions.handleExportJym,
    previewProjectArchiveImport: archiveImportActions.previewProjectArchiveImport,
    importProjectArchive: archiveImportActions.importProjectArchive,
    handleImportFile,
    annotationImportMismatchDialog: pendingAnnotationImport
      ? {
          isOpen: true,
          fileName: pendingAnnotationImport.fileName,
          notices: pendingAnnotationImport.notices,
          busy: annotationImportMismatchBusy,
          onClose: cancelAnnotationImportMismatch,
          onConfirm: confirmAnnotationImportMismatch,
        }
      : null,
  };
}
