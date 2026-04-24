import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type {
  LayerDocType,
  LayerLinkDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  MediaItemDocType,
  OrthographyDocType,
} from '../db';
import { layerUsesOwnSegments } from '../hooks/useLayerSegments';
import { unitToView } from '../hooks/timelineUnitView';
import { t, tf, type Locale } from '../i18n';
import { buildLaneHeaderInlineDotSeparatedLabel, formatTime } from '../utils/transcriptionFormatters';
import {
  buildOrthographyPreviewTextProps,
  resolveOrthographyRenderPolicy,
} from '../utils/layerDisplayStyle';
import {
  timelinePairedReadingSourceDraftAutoSaveKey,
  timelinePairedReadingTargetMergedDraftAutoSaveKey,
  timelinePairedReadingTargetSegmentDraftAutoSaveKey,
} from '../utils/timelineDraftAutoSaveKeys';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';
import { readNonEmptyAudioBlobFromMediaItem } from '../utils/translationRecordingMediaBlob';
import type { TimelineDraftSaveStatus } from './transcription/TimelineDraftEditorSurface';
import { TimelineLaneDraftEditorCell } from './transcription/TimelineLaneDraftEditorCell';
import type { ContextMenuItem } from './ContextMenu';
import {
  buildVerticalReadingTargetItemsFromRawText,
  pickTranslationSegmentForPersist,
  type VerticalReadingGroup,
  type PairedReadingSourceItem,
  type PairedReadingTargetItem,
} from '../utils/transcriptionVerticalReadingGroups';
import { filterTranslationLayersForVerticalReadingGroup, resolveVerticalReadingGroupEmptyReason } from '../utils/verticalReadingHostFilter';
import {
  verticalReadingUsesSplitTargetEditors,
  normalizePairedReadingPlainText,
  renderPairedReadingOverlay,
  renderPairedReadingRailLaneBody,
  resolvePairedReadingEditorRows,
  resolvePairedReadingExplicitTargetItemsForLayer,
  resolveVerticalReadingGroupAnchorForUi,
  resolvePairedReadingHorizontalBundleKey,
  resolvePairedReadingLayerLabel,
  resolvePairedReadingTargetPlainTextForLayer,
  resolvePairedReadingTranslationAudioScopeUnitId,
  partitionPairedReadingSourceItemsForDualTranscriptionColumns,
  partitionSecondarySourceItemsUnderPrimaryItems,
  transcriptionLayersOrderedForVerticalReadingSourceWalk,
} from './transcriptionTimelineVerticalViewHelpers';

type VerticalPaneFocusPatch = {
  activeVerticalReadingGroupId?: string | null;
  activeVerticalReadingCellId?: string | null;
  pairedReadingTargetSide?: 'source' | 'target' | null;
  contextMenuSourceUnitId?: string | null;
};

type NoteIndicator = { count: number; layerId?: string } | null;

interface TranscriptionTimelineVerticalViewGroupListProps {
  locale: Locale;
  visibleGroups: VerticalReadingGroup[];
  activeVerticalReadingGroupId: string | null;
  activeVerticalReadingCellId: string | null;
  pairedReadingTargetSide: 'source' | 'target' | null;
  contextMenuSourceUnitId: string | null;
  focusedLayerRowId: string;
  activeUnitId?: string;
  pairedReadingDualGridStyle?: CSSProperties | undefined;
  pairedReadingEditorHeightByGroup: Record<string, number>;
  defaultPairedReadingEditorMinHeight: number;
  layerIdToHorizontalBundleRootId: ReadonlyMap<string, string>;
  sourceLayer: LayerDocType | undefined;
  targetLayer: LayerDocType | undefined;
  translationLayers: LayerDocType[];
  transcriptionLayers: LayerDocType[];
  defaultTranscriptionLayerId?: string;
  layerLinks?: LayerLinkDocType[];
  unitByIdForSpeaker: ReadonlyMap<string, LayerUnitDocType>;
  renderLaneLabel: (layer: LayerDocType) => ReactNode;
  onFocusLayer: (layerId: string) => void;
  patchVerticalPaneFocus: (patch: VerticalPaneFocusPatch) => void;
  bundleOrdinalByKey: ReadonlyMap<string, number>;
  showBundleChips: boolean;
  pairedReadingHeaderOrthographies: OrthographyDocType[];
  buildPairedReadingLayerHeaderMenuItems: (layer: LayerDocType | undefined, label: string) => ContextMenuItem[];
  openPairedReadingMenuAtPointer: (event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => void;
  translationAudioByLayer?: Map<string, Map<string, LayerUnitContentDocType>> | undefined;
  mediaItemById: ReadonlyMap<string, MediaItemDocType>;
  recording: boolean;
  recordingUnitId?: string | null;
  recordingLayerId?: string | null;
  startRecordingForUnit?: ((unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>) | undefined;
  stopRecording?: (() => void) | undefined;
  deleteVoiceTranslation?: ((unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>) | undefined;
  transcribeVoiceTranslation?: ((
    unit: LayerUnitDocType,
    layer: LayerDocType,
    options?: { signal?: AbortSignal; audioBlob?: Blob },
  ) => Promise<void>) | undefined;
  orthographies: OrthographyDocType[];
  resizingPairedReadingEditorId?: string | null | undefined;
  pairedReadingResizeFontPreviewByLayerId: Record<string, number>;
  handlePairedReadingEditorResizeStart: (
    event: ReactPointerEvent<HTMLDivElement>,
    groupId: string,
    currentHeight: number,
    edge: 'top' | 'bottom',
  ) => void;
  translationDrafts: Record<string, string>;
  setTranslationDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  translationTextByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  unitDrafts: Record<string, string>;
  setUnitDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  focusedTranslationDraftKeyRef: React.MutableRefObject<string | null>;
  saveStatusByCellKey: Record<string, NonNullable<TimelineDraftSaveStatus>>;
  setPairedReadingCellSaveStatus: (cellKey: string, status?: NonNullable<TimelineDraftSaveStatus>) => void;
  runPairedReadingSaveWithStatus: (cellKey: string, saveTask: () => Promise<void>) => Promise<void>;
  scheduleAutoSave: (key: string, task: () => Promise<void>) => void;
  clearAutoSaveTimer: (key: string) => void;
  persistGroupTranslation: (
    persistLayer: LayerDocType,
    group: VerticalReadingGroup,
    anchorUnitIds: string[],
    value: string,
  ) => Promise<void>;
  persistPairedReadingTargetTranslation: (
    persistLayer: LayerDocType,
    targetItem: PairedReadingTargetItem,
    group: VerticalReadingGroup,
    anchorUnitIds: string[],
    value: string,
    combinedValue?: string,
  ) => Promise<void>;
  persistSourceText: (unitId: string, value: string, layerId?: string) => Promise<void>;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>> | undefined;
  segmentsByLayer?: ReadonlyMap<string, LayerUnitDocType[]> | undefined;
  resolveNoteIndicatorTarget?: ((unitId: string, layerId?: string, scope?: 'timeline' | 'waveform') => NoteIndicator) | undefined;
  resolveSelfCertaintyForUnit?: ((unitId: string, layerId?: string) => UnitSelfCertainty | undefined) | undefined;
  resolveSelfCertaintyAmbiguityForUnit?: ((unitId: string, layerId?: string) => boolean) | undefined;
  handleNoteClick?: ((unitId: string, layerId: string | undefined, event: React.MouseEvent) => void) | undefined;
  handleAnnotationClick: (
    uttId: string,
    uttStartTime: number,
    layerId: string,
    e: React.MouseEvent,
    overlapCycleItems?: Array<{ id: string; startTime: number }>,
  ) => void;
  handleAnnotationContextMenu?: ((
    uttId: string,
    utt: ReturnType<typeof unitToView>,
    layerId: string,
    e: React.MouseEvent,
  ) => void) | undefined;
  navigateUnitFromInput?: ((e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, direction: -1 | 1) => void) | undefined;
  speakerVisualByUnitId: Record<string, { name: string; color: string }>;
}

export function TranscriptionTimelineVerticalViewGroupList({
  locale,
  visibleGroups,
  activeVerticalReadingGroupId,
  activeVerticalReadingCellId,
  pairedReadingTargetSide,
  contextMenuSourceUnitId,
  focusedLayerRowId,
  activeUnitId,
  pairedReadingDualGridStyle,
  pairedReadingEditorHeightByGroup,
  defaultPairedReadingEditorMinHeight,
  layerIdToHorizontalBundleRootId,
  sourceLayer,
  targetLayer,
  translationLayers,
  transcriptionLayers,
  defaultTranscriptionLayerId,
  layerLinks = [],
  unitByIdForSpeaker,
  renderLaneLabel,
  onFocusLayer,
  patchVerticalPaneFocus,
  bundleOrdinalByKey,
  showBundleChips,
  pairedReadingHeaderOrthographies,
  buildPairedReadingLayerHeaderMenuItems,
  openPairedReadingMenuAtPointer,
  translationAudioByLayer,
  mediaItemById,
  recording,
  recordingUnitId,
  recordingLayerId,
  startRecordingForUnit,
  stopRecording,
  deleteVoiceTranslation,
  transcribeVoiceTranslation,
  orthographies,
  resizingPairedReadingEditorId,
  pairedReadingResizeFontPreviewByLayerId,
  handlePairedReadingEditorResizeStart,
  translationDrafts,
  setTranslationDrafts,
  translationTextByLayer,
  unitDrafts,
  setUnitDrafts,
  focusedTranslationDraftKeyRef,
  saveStatusByCellKey,
  setPairedReadingCellSaveStatus,
  runPairedReadingSaveWithStatus,
  scheduleAutoSave,
  clearAutoSaveTimer,
  persistGroupTranslation,
  persistPairedReadingTargetTranslation,
  persistSourceText,
  getUnitTextForLayer,
  segmentContentByLayer,
  segmentsByLayer,
  resolveNoteIndicatorTarget,
  resolveSelfCertaintyForUnit,
  resolveSelfCertaintyAmbiguityForUnit,
  handleNoteClick,
  handleAnnotationClick,
  handleAnnotationContextMenu,
  navigateUnitFromInput,
  speakerVisualByUnitId,
}: TranscriptionTimelineVerticalViewGroupListProps) {
  return (
    <>
      {visibleGroups.map((group, groupIndex) => {
        const perSegTargetsPrimary = verticalReadingUsesSplitTargetEditors(group);
        const persistAnchorUnitIds = group.isMultiAnchorGroup
          ? group.sourceItems.map((s) => s.unitId)
          : Array.from(new Set(group.targetItems.flatMap((item) => item.anchorUnitIds)));
        const anchorUnitIds = persistAnchorUnitIds;
        const primaryUnitId = group.sourceItems[0]?.unitId ?? '';
        const primarySourceUnit = primaryUnitId ? unitByIdForSpeaker.get(primaryUnitId) : undefined;
        const orderedTranscriptionLanes = transcriptionLayersOrderedForVerticalReadingSourceWalk({
          transcriptionLayers,
          translationLayers,
          allLayersOrdered: undefined,
          layerLinks,
        });
        const { primaryColumnItems, secondaryColumnItems } = partitionPairedReadingSourceItemsForDualTranscriptionColumns({
          sourceItems: group.sourceItems,
          translationLayers,
          orderedTranscriptionLanes,
        });
        const usesSecondaryTranscriptionColumn = secondaryColumnItems.length > 0;
        const secondaryTranscriptionBuckets = usesSecondaryTranscriptionColumn
          ? partitionSecondarySourceItemsUnderPrimaryItems(primaryColumnItems, secondaryColumnItems)
          : [];
        const hostMatchedTranslationLayers = filterTranslationLayersForVerticalReadingGroup(
          group,
          translationLayers,
          transcriptionLayers,
          defaultTranscriptionLayerId,
          sourceLayer?.id,
          layerLinks,
        );
        const groupTranslationAnchorUnitIds = Array.from(new Set(group.targetItems.flatMap((item) => item.anchorUnitIds)));
        const textBackedFallbackTranslationLayers = hostMatchedTranslationLayers.length === 0
          ? translationLayers.filter((layer) => {
              const layerTextMap = translationTextByLayer.get(layer.id);
              if (!layerTextMap || layerTextMap.size === 0) return false;
              return groupTranslationAnchorUnitIds.some((unitId) => {
                const content = layerTextMap.get(unitId);
                const text = normalizePairedReadingPlainText(content?.text ?? '');
                return text.length > 0;
              });
            })
          : [];
        const groupTranslationLayers = hostMatchedTranslationLayers.length > 0
          ? hostMatchedTranslationLayers
          : textBackedFallbackTranslationLayers;
        const targetEmptyReason = groupTranslationLayers.length === 0 && !usesSecondaryTranscriptionColumn
          ? resolveVerticalReadingGroupEmptyReason(
              group,
              translationLayers,
              transcriptionLayers,
              defaultTranscriptionLayerId,
              sourceLayer?.id,
              layerLinks,
            )
          : null;
        const groupPreferredTargetLayer = groupTranslationLayers.find((l) => l.id === targetLayer?.id)
          ?? groupTranslationLayers[0];
        /** 多译文层时 `group.targetItems` 只对 `pickTranslationLayer` 一层建模，主列勿复用以免少行 | Multi-layer: re-resolve per layer */
        const baseReuseGroupTargetItems = !(
          hostMatchedTranslationLayers.length === 0
          && group.targetItems.every((item) => normalizePairedReadingPlainText(item.text ?? '').length === 0)
        );
        const anchorForUi = resolveVerticalReadingGroupAnchorForUi(group, contextMenuSourceUnitId, activeUnitId);
        const derivedActive = activeUnitId != null && group.sourceItems.some((item) => item.unitId === activeUnitId);
        const isGroupActive = activeVerticalReadingGroupId === group.id || (activeVerticalReadingGroupId == null && derivedActive);
        const isTargetColumnFocused = isGroupActive && pairedReadingTargetSide === 'target';
        const pairedReadingLayoutMode: 'balanced' | 'one-to-many' | 'many-to-one' | 'many-to-many' = (() => {
          if (usesSecondaryTranscriptionColumn) {
            const stackedSourceRows = primaryColumnItems.length + secondaryColumnItems.length;
            const targetVisualRows = groupTranslationLayers.length === 0
              ? 1
              : groupTranslationLayers.reduce((n, tl) => {
                if (tl.id === groupPreferredTargetLayer?.id) {
                  if (translationLayers.length <= 1 && baseReuseGroupTargetItems) {
                    return n + (perSegTargetsPrimary ? group.targetItems.length : 1);
                  }
                  if (!primarySourceUnit) return n + 1;
                  const exPreferred = resolvePairedReadingExplicitTargetItemsForLayer(
                    primarySourceUnit,
                    tl,
                    defaultTranscriptionLayerId,
                    segmentsByLayer,
                    segmentContentByLayer,
                    unitByIdForSpeaker,
                  );
                  if (exPreferred && exPreferred.length > 1) return n + exPreferred.length;
                  return n + 1;
                }
                if (!primarySourceUnit) return n + 1;
                const ex = resolvePairedReadingExplicitTargetItemsForLayer(
                  primarySourceUnit,
                  tl,
                  defaultTranscriptionLayerId,
                  segmentsByLayer,
                  segmentContentByLayer,
                  unitByIdForSpeaker,
                );
                if (ex && ex.length > 1) return n + ex.length;
                return n + 1;
              }, 0);
            if (targetVisualRows > 1 && stackedSourceRows > 1) return 'many-to-many';
            if (targetVisualRows > 1) return 'one-to-many';
            if (stackedSourceRows > 1) return 'many-to-one';
            return 'balanced';
          }
          const sourceCount = group.sourceItems.length;
          const targetVisualRows = groupTranslationLayers.reduce((n, tl) => {
            if (tl.id === groupPreferredTargetLayer?.id) {
              if (translationLayers.length <= 1 && baseReuseGroupTargetItems) {
                return n + (perSegTargetsPrimary ? group.targetItems.length : 1);
              }
              if (!primarySourceUnit) return n + 1;
              const exPreferred = resolvePairedReadingExplicitTargetItemsForLayer(
                primarySourceUnit,
                tl,
                defaultTranscriptionLayerId,
                segmentsByLayer,
                segmentContentByLayer,
                unitByIdForSpeaker,
              );
              if (exPreferred && exPreferred.length > 1) return n + exPreferred.length;
              return n + 1;
            }
            if (!primarySourceUnit) return n + 1;
            const ex = resolvePairedReadingExplicitTargetItemsForLayer(
              primarySourceUnit,
              tl,
              defaultTranscriptionLayerId,
              segmentsByLayer,
              segmentContentByLayer,
              unitByIdForSpeaker,
            );
            if (ex && ex.length > 1) return n + ex.length;
            return n + 1;
          }, 0);
          if (targetVisualRows > 1 && sourceCount > 1) return 'many-to-many';
          if (targetVisualRows > 1) return 'one-to-many';
          if (sourceCount > 1) return 'many-to-one';
          return 'balanced';
        })();
        const pairedReadingEditorGroupKey = `paired-reading-editor:${group.id}`;
        const pairedReadingEditorHeight = pairedReadingEditorHeightByGroup[pairedReadingEditorGroupKey] ?? defaultPairedReadingEditorMinHeight;
        const bundleKey = resolvePairedReadingHorizontalBundleKey(
          group,
          layerIdToHorizontalBundleRootId,
          sourceLayer?.id,
        );
        const bundleOrdinal = bundleOrdinalByKey.get(bundleKey) ?? null;
        const prevGroup = groupIndex > 0 ? visibleGroups[groupIndex - 1] : undefined;
        const startsNewBundle = groupIndex === 0
          || (prevGroup != null
            && resolvePairedReadingHorizontalBundleKey(
              group,
              layerIdToHorizontalBundleRootId,
              sourceLayer?.id,
            ) !== resolvePairedReadingHorizontalBundleKey(
              prevGroup,
              layerIdToHorizontalBundleRootId,
              sourceLayer?.id,
            ));
        const pairedReadingEditorResizingThisGroup = resizingPairedReadingEditorId === pairedReadingEditorGroupKey;
        const isTargetHeaderActive = pairedReadingTargetSide === 'target'
          || (pairedReadingTargetSide == null && translationLayers.some((l) => l.id === focusedLayerRowId));
        const isSourceHeaderActive = !isTargetHeaderActive;

        return (
          <div
            key={group.id}
            data-paired-reading-group-id={group.id}
            data-paired-reading-layout={pairedReadingLayoutMode}
            className={`timeline-paired-reading-group${isGroupActive ? ' timeline-paired-reading-group-active' : ''}${startsNewBundle ? ' timeline-paired-reading-group-bundle-start' : ''}`}
            style={{
              ...(pairedReadingDualGridStyle ?? {}),
              ...(pairedReadingEditorGroupKey in pairedReadingEditorHeightByGroup
                ? { '--timeline-paired-reading-editor-min-height': `${pairedReadingEditorHeight}px` }
                : {}),
            } as CSSProperties}
          >
            <div className="timeline-paired-reading-group-meta">
              <div className="timeline-paired-reading-group-meta-left">
                <span
                  className="timeline-paired-reading-chip timeline-paired-reading-chip-group-ordinal"
                  title={tf(locale, 'transcription.pairedReading.groupOrdinalTitle', {
                    index: groupIndex + 1,
                    total: visibleGroups.length,
                  })}
                >
                  {tf(locale, 'transcription.pairedReading.groupOrdinalChip', {
                    index: groupIndex + 1,
                    total: visibleGroups.length,
                  })}
                </span>
                <div className="timeline-paired-reading-time">
                  {formatTime(group.startTime)} - {formatTime(group.endTime)}
                </div>
                {showBundleChips && startsNewBundle && bundleOrdinal ? (
                  <span className="timeline-paired-reading-chip timeline-paired-reading-chip-bundle">
                    {t(locale, 'transcription.pairedReading.bundleLabel')} {bundleOrdinal}
                  </span>
                ) : null}
                {group.speakerSummary.trim().length > 0 ? (
                  <span className="timeline-paired-reading-chip timeline-paired-reading-chip-speaker">
                    {group.speakerSummary}
                  </span>
                ) : null}
                {group.isMultiAnchorGroup ? (
                  <span className="timeline-paired-reading-chip timeline-paired-reading-chip-multi-anchor">
                    {t(locale, 'transcription.pairedReading.multiAnchor')}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="timeline-paired-reading-source-column">
              {primaryColumnItems.map((pItem, pi) => {
                const dependentRows = secondaryTranscriptionBuckets[pi] ?? [];
                const renderOne = (item: PairedReadingSourceItem, rowKind: 'primary' | 'dependent') => {
                  const sourceLayerId = item.layerId ?? sourceLayer?.id ?? '';
                  const focusCellId = rowKind === 'dependent'
                    ? `sec-trc:${(sourceLayerId || 'none').trim()}:${item.unitId}`
                    : `source:${item.unitId}`;
                  const isSourceCardActive = item.unitId === activeUnitId || activeVerticalReadingCellId === focusCellId;
                const sourceDraftKey = `trc-${sourceLayerId || 'none'}-${item.unitId}`;
                const initialSourceText = normalizePairedReadingPlainText(item.text || '');
                const sourceDraft = unitDrafts[sourceDraftKey] ?? initialSourceText;
                const sourceRows = resolvePairedReadingEditorRows(sourceDraft);
                const sourceCellKey = `pr-source:${sourceLayerId || 'none'}:${item.unitId}`;
                const sourceSaveStatus = saveStatusByCellKey[sourceCellKey];
                const isSourceDraftEmpty = normalizePairedReadingPlainText(sourceDraft).trim().length === 0;
                const sourceSelfCertainty = resolveSelfCertaintyForUnit?.(item.unitId, sourceLayerId || undefined);
                const sourceSelfCertaintyAmbiguous = !sourceSelfCertainty
                  && resolveSelfCertaintyAmbiguityForUnit?.(item.unitId, sourceLayerId || undefined) === true;
                const sourceNoteIndicator = resolveNoteIndicatorTarget?.(item.unitId, sourceLayerId || undefined) ?? null;
                const sourceBadge = renderPairedReadingOverlay({
                  locale,
                  certainty: sourceSelfCertainty,
                  ambiguous: sourceSelfCertaintyAmbiguous,
                  laneLabel: resolvePairedReadingLayerLabel(
                    transcriptionLayers.find((layer) => layer.id === sourceLayerId),
                    locale,
                    t(locale, 'transcription.pairedReading.sourceHeader'),
                  ),
                  noteCount: sourceNoteIndicator?.count ?? 0,
                  ...(sourceNoteIndicator && handleNoteClick
                    ? {
                        onNoteClick: (event: React.MouseEvent<SVGSVGElement>) => {
                          handleNoteClick(item.unitId, sourceNoteIndicator.layerId, event);
                        },
                      }
                    : {}),
                });
                const hasSourceBadge = Boolean(sourceSelfCertainty || sourceSelfCertaintyAmbiguous || sourceNoteIndicator);
                const sourceItemLayer = transcriptionLayers.find((layer) => layer.id === sourceLayerId);
                const sourcePreviewFont = pairedReadingEditorResizingThisGroup && sourceLayerId
                  ? pairedReadingResizeFontPreviewByLayerId[sourceLayerId]
                  : undefined;
                const sourceTypography = sourceItemLayer
                  ? buildOrthographyPreviewTextProps(
                      resolveOrthographyRenderPolicy(sourceItemLayer.languageId, orthographies, sourceItemLayer.orthographyId),
                      sourcePreviewFont != null
                        ? { ...sourceItemLayer.displaySettings, fontSize: sourcePreviewFont }
                        : sourceItemLayer.displaySettings,
                    )
                  : buildOrthographyPreviewTextProps(undefined, undefined);
                const sourceRowTitle = sourceItemLayer
                  ? (() => {
                      const inline = buildLaneHeaderInlineDotSeparatedLabel(
                        sourceItemLayer,
                        locale,
                        pairedReadingHeaderOrthographies,
                      ).trim();
                      return inline.length > 0
                        ? inline
                        : resolvePairedReadingLayerLabel(
                            sourceItemLayer,
                            locale,
                            t(locale, 'transcription.pairedReading.sourceHeader'),
                          );
                    })()
                  : t(locale, 'transcription.pairedReading.sourceHeader');
                const sourceRailAriaLabel = tf(locale, 'transcription.pairedReading.rowRailFocusLayer', { layer: sourceRowTitle });
                return (
                  <div
                    key={focusCellId}
                    className="timeline-paired-reading-editor-row timeline-paired-reading-editor-row-source"
                  >
                    <button
                      type="button"
                      className={`timeline-paired-reading-row-rail timeline-paired-reading-row-rail-source${isSourceHeaderActive ? ' is-active' : ''}`}
                      aria-pressed={isSourceHeaderActive}
                      aria-label={sourceRailAriaLabel}
                      title={sourceRowTitle}
                      data-testid={rowKind === 'dependent'
                        ? `paired-reading-secondary-trc-rail-${group.id}-${sourceLayerId}-${item.unitId}`
                        : `paired-reading-source-rail-${group.id}-${item.unitId}`}
                      onClick={() => {
                        patchVerticalPaneFocus({ pairedReadingTargetSide: 'source' });
                        if (sourceLayerId) onFocusLayer(sourceLayerId);
                      }}
                      onContextMenu={(event) => {
                        openPairedReadingMenuAtPointer(event, buildPairedReadingLayerHeaderMenuItems(sourceItemLayer, sourceRowTitle));
                      }}
                    >
                      {renderPairedReadingRailLaneBody({
                        layer: sourceItemLayer,
                        renderLaneLabel,
                        fallbackTitle: sourceRowTitle,
                        mode: 'full',
                      })}
                    </button>
                    <TimelineLaneDraftEditorCell
                      multiline
                      wrapperClassName={[
                        'timeline-paired-reading-source-surface',
                        isSourceDraftEmpty ? 'timeline-paired-reading-source-surface-empty' : '',
                        isSourceCardActive ? 'timeline-paired-reading-source-surface-active' : '',
                        hasSourceBadge ? 'timeline-paired-reading-source-surface-has-self-certainty' : '',
                        hasSourceBadge ? 'timeline-paired-reading-source-surface-has-side-badges' : '',
                      ].filter(Boolean).join(' ')}
                      inputClassName={[
                        'timeline-paired-reading-source-card',
                        'timeline-paired-reading-source-input',
                        isSourceCardActive ? 'timeline-paired-reading-source-card-active' : '',
                        isSourceDraftEmpty ? 'timeline-paired-reading-source-card-empty' : '',
                      ].filter(Boolean).join(' ')}
                      value={sourceDraft}
                      rows={sourceRows}
                      placeholder={t(locale, 'transcription.timeline.placeholder.segment')}
                      disabled={!sourceLayerId}
                      {...(sourceTypography.dir ? { dir: sourceTypography.dir } : {})}
                      inputStyle={sourceTypography.style}
                      {...(sourceSaveStatus !== undefined ? { saveStatus: sourceSaveStatus } : {})}
                      overlay={sourceBadge}
                      onRetry={() => {
                        if (!sourceLayerId) return;
                        void runPairedReadingSaveWithStatus(sourceCellKey, async () => {
                          await persistSourceText(item.unitId, sourceDraft, sourceLayerId);
                        });
                      }}
                      onResizeHandlePointerDown={(event, edge) => {
                        handlePairedReadingEditorResizeStart(event, group.id, pairedReadingEditorHeight, edge);
                      }}
                      onFocus={() => {
                        patchVerticalPaneFocus({
                          activeVerticalReadingGroupId: group.id,
                          activeVerticalReadingCellId: focusCellId,
                          pairedReadingTargetSide: 'source',
                          contextMenuSourceUnitId: item.unitId,
                        });
                        focusedTranslationDraftKeyRef.current = null;
                        if (sourceLayerId) onFocusLayer(sourceLayerId);
                      }}
                      onChange={(event) => {
                        const value = normalizePairedReadingPlainText(event.target.value);
                        patchVerticalPaneFocus({
                          activeVerticalReadingGroupId: group.id,
                          activeVerticalReadingCellId: focusCellId,
                          pairedReadingTargetSide: 'source',
                        });
                        setUnitDrafts((prev) => ({ ...prev, [sourceDraftKey]: value }));
                        if (!sourceLayerId) return;
                        if (value !== initialSourceText) {
                          setPairedReadingCellSaveStatus(sourceCellKey, 'dirty');
                          scheduleAutoSave(timelinePairedReadingSourceDraftAutoSaveKey(sourceLayerId, item.unitId), async () => {
                            await runPairedReadingSaveWithStatus(sourceCellKey, async () => {
                              await persistSourceText(item.unitId, value, sourceLayerId);
                            });
                          });
                        } else {
                          clearAutoSaveTimer(timelinePairedReadingSourceDraftAutoSaveKey(sourceLayerId, item.unitId));
                          setPairedReadingCellSaveStatus(sourceCellKey);
                        }
                      }}
                      onBlur={(event) => {
                        const value = normalizePairedReadingPlainText(event.target.value);
                        if (!sourceLayerId) return;
                        clearAutoSaveTimer(timelinePairedReadingSourceDraftAutoSaveKey(sourceLayerId, item.unitId));
                        if (value !== initialSourceText) {
                          void runPairedReadingSaveWithStatus(sourceCellKey, async () => {
                            await persistSourceText(item.unitId, value, sourceLayerId);
                          });
                        } else {
                          setPairedReadingCellSaveStatus(sourceCellKey);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return;
                        if (navigateUnitFromInput && event.key === 'Tab') {
                          navigateUnitFromInput(event, event.shiftKey ? -1 : 1);
                          return;
                        }
                        if (event.key !== 'Escape') return;
                        event.preventDefault();
                        if (sourceLayerId) {
                          clearAutoSaveTimer(timelinePairedReadingSourceDraftAutoSaveKey(sourceLayerId, item.unitId));
                        }
                        setUnitDrafts((prev) => ({ ...prev, [sourceDraftKey]: initialSourceText }));
                        setPairedReadingCellSaveStatus(sourceCellKey);
                        event.currentTarget.blur();
                      }}
                      onClick={(event) => {
                        patchVerticalPaneFocus({
                          activeVerticalReadingGroupId: group.id,
                          activeVerticalReadingCellId: focusCellId,
                          pairedReadingTargetSide: 'source',
                          contextMenuSourceUnitId: item.unitId,
                        });
                        if (!sourceLayerId) return;
                        handleAnnotationClick(item.unitId, item.startTime, sourceLayerId, event);
                        onFocusLayer(sourceLayerId);
                      }}
                      onContextMenu={(event) => {
                        if (!handleAnnotationContextMenu || !sourceLayerId) return;
                        const unitDoc = unitByIdForSpeaker.get(item.unitId);
                        if (!unitDoc) return;
                        patchVerticalPaneFocus({
                          activeVerticalReadingGroupId: group.id,
                          activeVerticalReadingCellId: focusCellId,
                          pairedReadingTargetSide: 'source',
                          contextMenuSourceUnitId: item.unitId,
                        });
                        handleAnnotationContextMenu(item.unitId, unitToView(unitDoc, sourceLayerId), sourceLayerId, event);
                      }}
                    />
                  </div>
                  );
                };
                if (dependentRows.length === 0) {
                  return renderOne(pItem, 'primary');
                }
                return (
                  <div
                    key={`trc-stack-${pItem.unitId}-${pi}`}
                    className="timeline-paired-reading-source-transcription-stack"
                  >
                    {renderOne(pItem, 'primary')}
                    {dependentRows.map((dep) => renderOne(dep, 'dependent'))}
                  </div>
                );
              })}
            </div>

            <div
              className={`timeline-paired-reading-target-column${isTargetColumnFocused ? ' timeline-paired-reading-target-column-active' : ''}`}
              data-paired-reading-translation-layer-count={groupTranslationLayers.length}
            >
              {groupTranslationLayers.length === 0 ? (
                  <div
                    className="timeline-paired-reading-target-empty"
                    data-testid={`paired-reading-target-empty-${group.id}`}
                  >
                    <p className="timeline-paired-reading-target-empty-hint">
                      {targetEmptyReason === 'orphan-needs-repair'
                        ? t(locale, 'transcription.pairedReading.orphanTranslationLayerNeedsRepair')
                        : t(locale, 'transcription.pairedReading.noChildTranslationLayers')}
                    </p>
                  </div>
                ) : (
                groupTranslationLayers.map((tLayer) => {
                  const isPrimaryLayer = tLayer.id === groupPreferredTargetLayer?.id;
                  const shouldReuseGroupTargetItems = isPrimaryLayer
                    && translationLayers.length <= 1
                    && baseReuseGroupTargetItems;
                  const layerTargetItems: PairedReadingTargetItem[] = shouldReuseGroupTargetItems
                    ? group.targetItems
                    : (() => {
                        if (!primarySourceUnit) {
                          return [{
                            id: `${group.id}:${tLayer.id}:placeholder`,
                            text: '',
                            anchorUnitIds: primaryUnitId ? [primaryUnitId] : [],
                          }];
                        }
                        const explicit = resolvePairedReadingExplicitTargetItemsForLayer(
                          primarySourceUnit,
                          tLayer,
                          defaultTranscriptionLayerId,
                          segmentsByLayer,
                          segmentContentByLayer,
                          unitByIdForSpeaker,
                        );
                        if (explicit != null && explicit.length > 0) return explicit;
                        const plain = resolvePairedReadingTargetPlainTextForLayer(
                          primarySourceUnit,
                          tLayer,
                          defaultTranscriptionLayerId,
                          segmentsByLayer,
                          segmentContentByLayer,
                          translationTextByLayer,
                          unitByIdForSpeaker,
                        );
                        return buildVerticalReadingTargetItemsFromRawText(primarySourceUnit.id, plain);
                      })();
                  const layerPerSeg = isPrimaryLayer
                    ? (translationLayers.length <= 1
                      ? perSegTargetsPrimary
                      : layerTargetItems.length > 1)
                    : layerTargetItems.length > 1;
                  const layerHeaderLabel = resolvePairedReadingLayerLabel(
                    tLayer,
                    locale,
                    t(locale, 'transcription.pairedReading.translationHeader'),
                  );
                  const layerHeaderContent = (() => {
                    const inline = buildLaneHeaderInlineDotSeparatedLabel(
                      tLayer,
                      locale,
                      pairedReadingHeaderOrthographies,
                    ).trim();
                    return inline.length > 0 ? inline : layerHeaderLabel;
                  })();
                  const translationSegmentsForAudio = segmentsByLayer?.get(tLayer.id) ?? [];
                  const audioAnchorSeg = layerUsesOwnSegments(tLayer, defaultTranscriptionLayerId)
                    ? pickTranslationSegmentForPersist(translationSegmentsForAudio, group.startTime, group.endTime)
                    : undefined;
                  const layerNoteIndicator = anchorForUi.unitId
                    ? resolveNoteIndicatorTarget?.(anchorForUi.unitId, tLayer.id) ?? null
                    : null;
                  const canRecordLayerAudio = Boolean(startRecordingForUnit)
                    && (tLayer.acceptsAudio === true || tLayer.modality === 'mixed' || tLayer.modality === 'audio');
                  const isAudioOnlyTranslationLayer = tLayer.modality === 'audio';
                  const buildTranslationAudioControlsForAnchor = (
                    anchorSegForScope: LayerUnitDocType | undefined,
                  ): ReactNode => {
                    const audioScopeId = resolvePairedReadingTranslationAudioScopeUnitId({
                      audioAnchorSeg: anchorSegForScope,
                      anchorUnitIds,
                      contextMenuSourceUnitId,
                      activeUnitId,
                      primaryUnitId,
                      translationAudioByLayer,
                      targetLayerId: tLayer.id,
                    });
                    const voiceDoc = unitByIdForSpeaker.get(audioScopeId) ?? primarySourceUnit;
                    const audioRow = translationAudioByLayer?.get(tLayer.id)?.get(audioScopeId);
                    const media = audioRow?.translationAudioMediaId
                      ? mediaItemById.get(audioRow.translationAudioMediaId)
                      : undefined;
                    const isRowRecording = recording && recordingUnitId === audioScopeId && recordingLayerId === tLayer.id;
                    const showRow = Boolean(media) || isRowRecording || canRecordLayerAudio;
                    if (!showRow || !voiceDoc) return null;
                    return (
                      <TimelineTranslationAudioControls
                        {...(media ? { mediaItem: media } : {})}
                        isRecording={isRowRecording}
                        disabled={recording && !isRowRecording}
                        compact={!isAudioOnlyTranslationLayer}
                        onStartRecording={() => {
                          void startRecordingForUnit?.(voiceDoc, tLayer);
                        }}
                        {...(stopRecording ? { onStopRecording: stopRecording } : {})}
                        {...(media && deleteVoiceTranslation ? {
                          onDeleteRecording: () => deleteVoiceTranslation(voiceDoc, tLayer),
                        } : {})}
                        {...(tLayer.modality === 'mixed' && transcribeVoiceTranslation && media
                          ? {
                              onTranscribeRecording: () => {
                                const b = readNonEmptyAudioBlobFromMediaItem(media);
                                return transcribeVoiceTranslation(voiceDoc, tLayer, b ? { audioBlob: b } : undefined);
                              },
                            }
                          : {})}
                      />
                    );
                  };
                  const layerAudioControls = buildTranslationAudioControlsForAnchor(audioAnchorSeg);
                  const layerPreviewFont = pairedReadingEditorResizingThisGroup
                    ? pairedReadingResizeFontPreviewByLayerId[tLayer.id]
                    : undefined;
                  const layerTypography = buildOrthographyPreviewTextProps(
                    resolveOrthographyRenderPolicy(tLayer.languageId, orthographies, tLayer.orthographyId),
                    layerPreviewFont != null
                      ? { ...tLayer.displaySettings, fontSize: layerPreviewFont }
                      : tLayer.displaySettings,
                  );
                  const layerDraftKeyBase = `cmp:${tLayer.id}:${group.id}`;
                  const layerCellKeyBase = `pr-target:${tLayer.id}:${group.id}`;
                  const pairedReadingAutoSaveKey = timelinePairedReadingTargetMergedDraftAutoSaveKey(tLayer.id, group.id);

                  return (
                    <div key={tLayer.id} className="timeline-paired-reading-target-layer-stack">
                      {layerPerSeg
                        ? layerTargetItems.map((targetItem, ti) => {
                            const itemDraftKey = `${layerDraftKeyBase}:${targetItem.id}`;
                            const itemInitial = normalizePairedReadingPlainText(targetItem.text || '');
                            const itemDraft = translationDrafts[itemDraftKey] ?? itemInitial;
                            const itemCellKey = `${layerCellKeyBase}:${targetItem.id}`;
                            const itemSaveStatus = saveStatusByCellKey[itemCellKey];
                            const isItemDraftEmpty = normalizePairedReadingPlainText(itemDraft).trim().length === 0;
                            const isThisTargetRowActive = isGroupActive && pairedReadingTargetSide === 'target'
                              && activeVerticalReadingCellId === `target:${group.id}:${tLayer.id}:${targetItem.id}`;
                            const segAutoSaveKey = timelinePairedReadingTargetSegmentDraftAutoSaveKey(
                              tLayer.id,
                              group.id,
                              targetItem.id,
                            );
                            const buildCombinedTargetValue = (nextValue: string): string => (
                              layerTargetItems
                                .map((item) => {
                                  if (item.id === targetItem.id) return normalizePairedReadingPlainText(nextValue);
                                  const otherDraftKey = `${layerDraftKeyBase}:${item.id}`;
                                  return normalizePairedReadingPlainText(translationDrafts[otherDraftKey] ?? item.text ?? '');
                                })
                                .join('\n')
                            );
                            const rowSegmentId = targetItem.translationSegmentId?.trim();
                            const rowAnchorSegForAudio = rowSegmentId
                              ? translationSegmentsForAudio.find((s) => s.id === rowSegmentId) ?? audioAnchorSeg
                              : audioAnchorSeg;
                            return (
                              <div key={`${tLayer.id}-${targetItem.id}`} className="timeline-paired-reading-editor-row timeline-paired-reading-editor-row-target">
                                <button
                                  type="button"
                                  className={`timeline-paired-reading-row-rail timeline-paired-reading-row-rail-target${isTargetHeaderActive ? ' is-active' : ''}`}
                                  aria-pressed={isTargetHeaderActive}
                                  aria-label={tf(locale, 'transcription.pairedReading.rowRailFocusLayer', { layer: layerHeaderContent })}
                                  title={layerHeaderContent}
                                  data-testid={`paired-reading-target-rail-${group.id}-${tLayer.id}-${targetItem.id}`}
                                  onClick={() => {
                                    patchVerticalPaneFocus({ pairedReadingTargetSide: 'target' });
                                    onFocusLayer(tLayer.id);
                                  }}
                                  onContextMenu={(event) => {
                                    openPairedReadingMenuAtPointer(event, buildPairedReadingLayerHeaderMenuItems(tLayer, layerHeaderContent));
                                  }}
                                >
                                  {renderPairedReadingRailLaneBody({
                                    layer: tLayer,
                                    renderLaneLabel,
                                    fallbackTitle: layerHeaderContent,
                                    mode: layerPerSeg && ti > 0 ? 'continuation' : 'full',
                                  })}
                                </button>
                                {isAudioOnlyTranslationLayer ? (
                                  <div
                                    className={[
                                      'timeline-paired-reading-target-surface',
                                      'timeline-paired-reading-target-surface-audio-only',
                                      isThisTargetRowActive ? 'timeline-paired-reading-target-surface-active' : '',
                                      layerNoteIndicator ? 'timeline-paired-reading-target-surface-has-side-badges' : '',
                                    ].filter(Boolean).join(' ')}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(event) => {
                                      if (!anchorForUi.unitId) return;
                                      patchVerticalPaneFocus({
                                        activeVerticalReadingGroupId: group.id,
                                        activeVerticalReadingCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                        pairedReadingTargetSide: 'target',
                                        contextMenuSourceUnitId: anchorForUi.unitId,
                                      });
                                      handleAnnotationClick(anchorForUi.unitId, anchorForUi.startTime, tLayer.id, event);
                                    }}
                                    onContextMenu={(event) => {
                                      if (!handleAnnotationContextMenu) return;
                                      const menuSourceId = contextMenuSourceUnitId != null
                                        && group.sourceItems.some((si) => si.unitId === contextMenuSourceUnitId)
                                        ? contextMenuSourceUnitId
                                        : primaryUnitId;
                                      const menuUnitDoc = menuSourceId ? unitByIdForSpeaker.get(menuSourceId) : undefined;
                                      if (!menuUnitDoc) return;
                                      patchVerticalPaneFocus({
                                        activeVerticalReadingGroupId: group.id,
                                        activeVerticalReadingCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                        pairedReadingTargetSide: 'target',
                                      });
                                      handleAnnotationContextMenu(menuSourceId, unitToView(menuUnitDoc, tLayer.id), tLayer.id, event);
                                    }}
                                  >
                                    <div className="timeline-draft-editor-surface-overlay">
                                      {renderPairedReadingOverlay({
                                        locale,
                                        certainty: undefined,
                                        ambiguous: false,
                                        laneLabel: layerHeaderLabel,
                                        noteCount: layerNoteIndicator?.count ?? 0,
                                        ...(layerNoteIndicator && anchorForUi.unitId && handleNoteClick
                                          ? {
                                              onNoteClick: (event: React.MouseEvent<SVGSVGElement>) => {
                                                handleNoteClick(anchorForUi.unitId, layerNoteIndicator.layerId, event);
                                              },
                                            }
                                          : {}),
                                      })}
                                    </div>
                                    <div className="timeline-translation-audio-card timeline-paired-reading-target-audio-only-inner">
                                      {buildTranslationAudioControlsForAnchor(rowAnchorSegForAudio ?? audioAnchorSeg)}
                                    </div>
                                  </div>
                                ) : (
                                  <TimelineLaneDraftEditorCell
                                    multiline
                                    wrapperClassName={[
                                      'timeline-paired-reading-target-surface',
                                      isItemDraftEmpty ? 'timeline-paired-reading-target-surface-empty' : '',
                                      isThisTargetRowActive ? 'timeline-paired-reading-target-surface-active' : '',
                                      layerNoteIndicator ? 'timeline-paired-reading-target-surface-has-side-badges' : '',
                                    ].filter(Boolean).join(' ')}
                                    inputClassName={[
                                      'timeline-paired-reading-target-input',
                                      isItemDraftEmpty ? 'timeline-paired-reading-target-input-empty' : '',
                                    ].filter(Boolean).join(' ')}
                                    value={itemDraft}
                                    rows={resolvePairedReadingEditorRows(itemDraft)}
                                    placeholder={t(locale, 'transcription.timeline.placeholder.translation')}
                                    {...(layerTypography.dir ? { dir: layerTypography.dir } : {})}
                                    inputStyle={layerTypography.style}
                                    {...(itemSaveStatus !== undefined ? { saveStatus: itemSaveStatus } : {})}
                                    overlay={renderPairedReadingOverlay({
                                      locale,
                                      certainty: undefined,
                                      ambiguous: false,
                                      laneLabel: layerHeaderLabel,
                                      noteCount: layerNoteIndicator?.count ?? 0,
                                      ...(layerNoteIndicator && anchorForUi.unitId && handleNoteClick
                                        ? {
                                            onNoteClick: (event: React.MouseEvent<SVGSVGElement>) => {
                                              handleNoteClick(anchorForUi.unitId, layerNoteIndicator.layerId, event);
                                            },
                                          }
                                        : {}),
                                    })}
                                    onResizeHandlePointerDown={(event, edge) => {
                                      handlePairedReadingEditorResizeStart(event, group.id, pairedReadingEditorHeight, edge);
                                    }}
                                    onRetry={() => {
                                      void runPairedReadingSaveWithStatus(itemCellKey, async () => {
                                        await persistPairedReadingTargetTranslation(
                                          tLayer,
                                          targetItem,
                                          group,
                                          persistAnchorUnitIds,
                                          normalizePairedReadingPlainText(itemDraft),
                                          buildCombinedTargetValue(itemDraft),
                                        );
                                      });
                                    }}
                                    {...(ti === 0 && layerAudioControls ? { tools: layerAudioControls } : {})}
                                    toolsClassName="timeline-paired-reading-target-tools"
                                    onFocus={() => {
                                      patchVerticalPaneFocus({
                                        activeVerticalReadingGroupId: group.id,
                                        activeVerticalReadingCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                        pairedReadingTargetSide: 'target',
                                        contextMenuSourceUnitId: anchorForUi.unitId || primaryUnitId || null,
                                      });
                                      focusedTranslationDraftKeyRef.current = itemDraftKey;
                                      onFocusLayer(tLayer.id);
                                    }}
                                    onChange={(event) => {
                                      const value = normalizePairedReadingPlainText(event.target.value);
                                      patchVerticalPaneFocus({
                                        activeVerticalReadingGroupId: group.id,
                                        activeVerticalReadingCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                        pairedReadingTargetSide: 'target',
                                      });
                                      setTranslationDrafts((prev) => ({ ...prev, [itemDraftKey]: value }));
                                      if (value !== itemInitial) {
                                        setPairedReadingCellSaveStatus(itemCellKey, 'dirty');
                                        scheduleAutoSave(segAutoSaveKey, async () => {
                                          await runPairedReadingSaveWithStatus(itemCellKey, async () => {
                                            await persistPairedReadingTargetTranslation(
                                              tLayer,
                                              targetItem,
                                              group,
                                              persistAnchorUnitIds,
                                              value,
                                              buildCombinedTargetValue(value),
                                            );
                                          });
                                        });
                                      } else {
                                        clearAutoSaveTimer(segAutoSaveKey);
                                        setPairedReadingCellSaveStatus(itemCellKey);
                                      }
                                    }}
                                    onBlur={(event) => {
                                      focusedTranslationDraftKeyRef.current = null;
                                      const value = normalizePairedReadingPlainText(event.target.value);
                                      clearAutoSaveTimer(segAutoSaveKey);
                                      if (value !== itemInitial) {
                                        void runPairedReadingSaveWithStatus(itemCellKey, async () => {
                                          await persistPairedReadingTargetTranslation(
                                            tLayer,
                                            targetItem,
                                            group,
                                            persistAnchorUnitIds,
                                            value,
                                            buildCombinedTargetValue(value),
                                          );
                                        });
                                      } else {
                                        setPairedReadingCellSaveStatus(itemCellKey);
                                      }
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.nativeEvent.isComposing) return;
                                      if (navigateUnitFromInput && event.key === 'Tab') {
                                        navigateUnitFromInput(event, event.shiftKey ? -1 : 1);
                                        return;
                                      }
                                      if (event.key !== 'Escape') return;
                                      event.preventDefault();
                                      clearAutoSaveTimer(segAutoSaveKey);
                                      setTranslationDrafts((prev) => ({ ...prev, [itemDraftKey]: itemInitial }));
                                      setPairedReadingCellSaveStatus(itemCellKey);
                                      event.currentTarget.blur();
                                    }}
                                    onClick={(event) => {
                                      if (!anchorForUi.unitId) return;
                                      patchVerticalPaneFocus({
                                        activeVerticalReadingGroupId: group.id,
                                        activeVerticalReadingCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                        pairedReadingTargetSide: 'target',
                                        contextMenuSourceUnitId: anchorForUi.unitId,
                                      });
                                      handleAnnotationClick(anchorForUi.unitId, anchorForUi.startTime, tLayer.id, event);
                                    }}
                                    onContextMenu={(event) => {
                                      if (!handleAnnotationContextMenu) return;
                                      const menuSourceId = contextMenuSourceUnitId != null
                                        && group.sourceItems.some((si) => si.unitId === contextMenuSourceUnitId)
                                        ? contextMenuSourceUnitId
                                        : primaryUnitId;
                                      const menuUnitDoc = menuSourceId ? unitByIdForSpeaker.get(menuSourceId) : undefined;
                                      if (!menuUnitDoc) return;
                                      patchVerticalPaneFocus({
                                        activeVerticalReadingGroupId: group.id,
                                        activeVerticalReadingCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                        pairedReadingTargetSide: 'target',
                                      });
                                      handleAnnotationContextMenu(menuSourceId, unitToView(menuUnitDoc, tLayer.id), tLayer.id, event);
                                    }}
                                  />
                                )}
                              </div>
                            );
                          })
                        : (() => {
                            const draftKey = layerDraftKeyBase;
                            const initialTargetText = layerTargetItems.map((item) => item.text).join('\n');
                            const draft = translationDrafts[draftKey] ?? initialTargetText;
                            const targetCellKey = layerCellKeyBase;
                            const targetSaveStatus = saveStatusByCellKey[targetCellKey];
                            const isTargetDraftEmpty = normalizePairedReadingPlainText(draft).trim().length === 0;
                            const isMergedTargetRowActive = isGroupActive && pairedReadingTargetSide === 'target'
                              && activeVerticalReadingCellId === `target:${group.id}:${tLayer.id}:editor`;
                            return (
                              <div className="timeline-paired-reading-editor-row timeline-paired-reading-editor-row-target">
                                <button
                                  type="button"
                                  className={`timeline-paired-reading-row-rail timeline-paired-reading-row-rail-target${isTargetHeaderActive ? ' is-active' : ''}`}
                                  aria-pressed={isTargetHeaderActive}
                                  aria-label={tf(locale, 'transcription.pairedReading.rowRailFocusLayer', { layer: layerHeaderContent })}
                                  title={layerHeaderContent}
                                  data-testid={`paired-reading-target-rail-${group.id}-${tLayer.id}`}
                                  onClick={() => {
                                    patchVerticalPaneFocus({ pairedReadingTargetSide: 'target' });
                                    onFocusLayer(tLayer.id);
                                  }}
                                  onContextMenu={(event) => {
                                    openPairedReadingMenuAtPointer(event, buildPairedReadingLayerHeaderMenuItems(tLayer, layerHeaderContent));
                                  }}
                                >
                                  {renderPairedReadingRailLaneBody({
                                    layer: tLayer,
                                    renderLaneLabel,
                                    fallbackTitle: layerHeaderContent,
                                    mode: 'full',
                                  })}
                                </button>
                                {isAudioOnlyTranslationLayer ? (
                                  <div
                                    className={[
                                      'timeline-paired-reading-target-surface',
                                      'timeline-paired-reading-target-surface-audio-only',
                                      isMergedTargetRowActive ? 'timeline-paired-reading-target-surface-active' : '',
                                      layerNoteIndicator ? 'timeline-paired-reading-target-surface-has-side-badges' : '',
                                    ].filter(Boolean).join(' ')}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(event) => {
                                      if (!anchorForUi.unitId) return;
                                      patchVerticalPaneFocus({
                                        activeVerticalReadingGroupId: group.id,
                                        activeVerticalReadingCellId: `target:${group.id}:${tLayer.id}:editor`,
                                        pairedReadingTargetSide: 'target',
                                        contextMenuSourceUnitId: anchorForUi.unitId,
                                      });
                                      handleAnnotationClick(anchorForUi.unitId, anchorForUi.startTime, tLayer.id, event);
                                    }}
                                    onContextMenu={(event) => {
                                      if (!handleAnnotationContextMenu) return;
                                      const menuSourceId = contextMenuSourceUnitId != null
                                        && group.sourceItems.some((si) => si.unitId === contextMenuSourceUnitId)
                                        ? contextMenuSourceUnitId
                                        : primaryUnitId;
                                      const menuUnitDoc = menuSourceId ? unitByIdForSpeaker.get(menuSourceId) : undefined;
                                      if (!menuUnitDoc) return;
                                      patchVerticalPaneFocus({
                                        activeVerticalReadingGroupId: group.id,
                                        activeVerticalReadingCellId: `target:${group.id}:${tLayer.id}:editor`,
                                        pairedReadingTargetSide: 'target',
                                      });
                                      handleAnnotationContextMenu(menuSourceId, unitToView(menuUnitDoc, tLayer.id), tLayer.id, event);
                                    }}
                                  >
                                    <div className="timeline-draft-editor-surface-overlay">
                                      {renderPairedReadingOverlay({
                                        locale,
                                        certainty: undefined,
                                        ambiguous: false,
                                        laneLabel: layerHeaderLabel,
                                        noteCount: layerNoteIndicator?.count ?? 0,
                                        ...(layerNoteIndicator && anchorForUi.unitId && handleNoteClick
                                          ? {
                                              onNoteClick: (event: React.MouseEvent<SVGSVGElement>) => {
                                                handleNoteClick(anchorForUi.unitId, layerNoteIndicator.layerId, event);
                                              },
                                            }
                                          : {}),
                                      })}
                                    </div>
                                    <div className="timeline-translation-audio-card timeline-paired-reading-target-audio-only-inner">
                                      {buildTranslationAudioControlsForAnchor(audioAnchorSeg)}
                                    </div>
                                  </div>
                                ) : (
                                  <TimelineLaneDraftEditorCell
                                    multiline
                                    wrapperClassName={[
                                      'timeline-paired-reading-target-surface',
                                      isTargetDraftEmpty ? 'timeline-paired-reading-target-surface-empty' : '',
                                      isMergedTargetRowActive ? 'timeline-paired-reading-target-surface-active' : '',
                                      layerNoteIndicator ? 'timeline-paired-reading-target-surface-has-side-badges' : '',
                                    ].filter(Boolean).join(' ')}
                                    inputClassName={[
                                      'timeline-paired-reading-target-input',
                                      isTargetDraftEmpty ? 'timeline-paired-reading-target-input-empty' : '',
                                    ].filter(Boolean).join(' ')}
                                    value={draft}
                                    rows={resolvePairedReadingEditorRows(draft)}
                                    placeholder={t(locale, 'transcription.timeline.placeholder.translation')}
                                    {...(isPrimaryLayer && group.editingTargetPolicy === 'multi-target-items'
                                      ? { title: t(locale, 'transcription.pairedReading.multiTargetHint') }
                                      : {})}
                                    {...(layerTypography.dir ? { dir: layerTypography.dir } : {})}
                                    inputStyle={layerTypography.style}
                                    {...(targetSaveStatus !== undefined ? { saveStatus: targetSaveStatus } : {})}
                                    overlay={renderPairedReadingOverlay({
                                      locale,
                                      certainty: undefined,
                                      ambiguous: false,
                                      laneLabel: layerHeaderLabel,
                                      noteCount: layerNoteIndicator?.count ?? 0,
                                      ...(layerNoteIndicator && anchorForUi.unitId && handleNoteClick
                                        ? {
                                            onNoteClick: (event: React.MouseEvent<SVGSVGElement>) => {
                                              handleNoteClick(anchorForUi.unitId, layerNoteIndicator.layerId, event);
                                            },
                                          }
                                        : {}),
                                    })}
                                    onResizeHandlePointerDown={(event, edge) => {
                                      handlePairedReadingEditorResizeStart(event, group.id, pairedReadingEditorHeight, edge);
                                    }}
                                    onRetry={() => {
                                      void runPairedReadingSaveWithStatus(targetCellKey, async () => {
                                        await persistGroupTranslation(
                                          tLayer,
                                          group,
                                          persistAnchorUnitIds,
                                          normalizePairedReadingPlainText(draft),
                                        );
                                      });
                                    }}
                                    {...(layerAudioControls ? { tools: layerAudioControls } : {})}
                                    toolsClassName="timeline-paired-reading-target-tools"
                                    onFocus={() => {
                                      patchVerticalPaneFocus({
                                        activeVerticalReadingGroupId: group.id,
                                        activeVerticalReadingCellId: `target:${group.id}:${tLayer.id}:editor`,
                                        pairedReadingTargetSide: 'target',
                                        contextMenuSourceUnitId: anchorForUi.unitId || primaryUnitId || null,
                                      });
                                      focusedTranslationDraftKeyRef.current = draftKey;
                                      onFocusLayer(tLayer.id);
                                    }}
                                    onChange={(event) => {
                                      const value = normalizePairedReadingPlainText(event.target.value);
                                      patchVerticalPaneFocus({
                                        activeVerticalReadingGroupId: group.id,
                                        activeVerticalReadingCellId: `target:${group.id}:${tLayer.id}:editor`,
                                        pairedReadingTargetSide: 'target',
                                      });
                                      setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
                                      if (value !== initialTargetText) {
                                        setPairedReadingCellSaveStatus(targetCellKey, 'dirty');
                                        scheduleAutoSave(pairedReadingAutoSaveKey, async () => {
                                          await runPairedReadingSaveWithStatus(targetCellKey, async () => {
                                            await persistGroupTranslation(tLayer, group, persistAnchorUnitIds, value);
                                          });
                                        });
                                      } else {
                                        clearAutoSaveTimer(pairedReadingAutoSaveKey);
                                        setPairedReadingCellSaveStatus(targetCellKey);
                                      }
                                    }}
                                    onBlur={(event) => {
                                      focusedTranslationDraftKeyRef.current = null;
                                      const value = normalizePairedReadingPlainText(event.target.value);
                                      clearAutoSaveTimer(pairedReadingAutoSaveKey);
                                      if (value !== initialTargetText) {
                                        void runPairedReadingSaveWithStatus(targetCellKey, async () => {
                                          await persistGroupTranslation(tLayer, group, persistAnchorUnitIds, value);
                                        });
                                      } else {
                                        setPairedReadingCellSaveStatus(targetCellKey);
                                      }
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.nativeEvent.isComposing) return;
                                      if (navigateUnitFromInput && event.key === 'Tab') {
                                        navigateUnitFromInput(event, event.shiftKey ? -1 : 1);
                                        return;
                                      }
                                      if (event.key !== 'Escape') return;
                                      event.preventDefault();
                                      clearAutoSaveTimer(pairedReadingAutoSaveKey);
                                      setTranslationDrafts((prev) => ({ ...prev, [draftKey]: initialTargetText }));
                                      setPairedReadingCellSaveStatus(targetCellKey);
                                      event.currentTarget.blur();
                                    }}
                                    onClick={(event) => {
                                      if (!anchorForUi.unitId) return;
                                      patchVerticalPaneFocus({
                                        activeVerticalReadingGroupId: group.id,
                                        activeVerticalReadingCellId: `target:${group.id}:${tLayer.id}:editor`,
                                        pairedReadingTargetSide: 'target',
                                        contextMenuSourceUnitId: anchorForUi.unitId,
                                      });
                                      handleAnnotationClick(anchorForUi.unitId, anchorForUi.startTime, tLayer.id, event);
                                    }}
                                    onContextMenu={(event) => {
                                      if (!handleAnnotationContextMenu) return;
                                      const menuSourceId = contextMenuSourceUnitId != null
                                        && group.sourceItems.some((si) => si.unitId === contextMenuSourceUnitId)
                                        ? contextMenuSourceUnitId
                                        : primaryUnitId;
                                      const menuUnitDoc = menuSourceId ? unitByIdForSpeaker.get(menuSourceId) : undefined;
                                      if (!menuUnitDoc) return;
                                      patchVerticalPaneFocus({
                                        activeVerticalReadingGroupId: group.id,
                                        activeVerticalReadingCellId: `target:${group.id}:${tLayer.id}:editor`,
                                        pairedReadingTargetSide: 'target',
                                      });
                                      handleAnnotationContextMenu(menuSourceId, unitToView(menuUnitDoc, tLayer.id), tLayer.id, event);
                                    }}
                                  />
                                )}
                              </div>
                            );
                          })()}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
