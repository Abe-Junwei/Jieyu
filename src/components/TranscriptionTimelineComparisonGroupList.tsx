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
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';
import { readNonEmptyAudioBlobFromMediaItem } from '../utils/translationRecordingMediaBlob';
import { TimelineDraftEditorSurface, type TimelineDraftSaveStatus } from './transcription/TimelineDraftEditorSurface';
import type { ContextMenuItem } from './ContextMenu';
import {
  buildComparisonTargetItemsFromRawText,
  pickTranslationSegmentForPersist,
  type ComparisonGroup,
  type ComparisonTargetItem,
} from '../utils/transcriptionComparisonGroups';
import { filterTranslationLayersForComparisonGroup, resolveComparisonGroupEmptyReason } from '../utils/comparisonHostFilter';
import {
  comparisonUsesSplitTargetEditors,
  normalizeComparisonText,
  renderComparisonOverlay,
  renderComparisonRailLaneBody,
  resolveComparisonEditorRows,
  resolveComparisonExplicitTargetItemsForLayer,
  resolveComparisonGroupAnchorForUi,
  resolveComparisonHorizontalBundleKey,
  resolveComparisonLayerLabel,
  resolveComparisonTargetPlainTextForLayer,
  resolveComparisonTranslationAudioScopeUnitId,
} from './transcriptionTimelineComparisonHelpers';

type ComparisonFocusPatch = {
  activeComparisonGroupId?: string | null;
  activeComparisonCellId?: string | null;
  comparisonTargetSide?: 'source' | 'target' | null;
  contextMenuSourceUnitId?: string | null;
};

type NoteIndicator = { count: number; layerId?: string } | null;

interface TranscriptionTimelineComparisonGroupListProps {
  locale: Locale;
  visibleGroups: ComparisonGroup[];
  activeComparisonGroupId: string | null;
  activeComparisonCellId: string | null;
  comparisonTargetSide: 'source' | 'target' | null;
  contextMenuSourceUnitId: string | null;
  focusedLayerRowId: string;
  activeUnitId?: string;
  comparisonDualGridStyle?: CSSProperties | undefined;
  comparisonEditorHeightByGroup: Record<string, number>;
  defaultComparisonEditorHeight: number;
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
  patchComparisonFocus: (patch: ComparisonFocusPatch) => void;
  bundleOrdinalByKey: ReadonlyMap<string, number>;
  showBundleChips: boolean;
  comparisonHeaderOrthographies: OrthographyDocType[];
  buildComparisonHeaderMenuItems: (layer: LayerDocType | undefined, label: string) => ContextMenuItem[];
  openComparisonMenuAtPointer: (event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => void;
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
  resizingComparisonEditorId?: string | null | undefined;
  comparisonResizeFontPreviewByLayerId: Record<string, number>;
  handleComparisonEditorResizeStart: (
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
  setComparisonCellSaveStatus: (cellKey: string, status?: NonNullable<TimelineDraftSaveStatus>) => void;
  runComparisonSaveWithStatus: (cellKey: string, saveTask: () => Promise<void>) => Promise<void>;
  scheduleAutoSave: (key: string, task: () => Promise<void>) => void;
  clearAutoSaveTimer: (key: string) => void;
  persistGroupTranslation: (
    persistLayer: LayerDocType,
    group: ComparisonGroup,
    anchorUnitIds: string[],
    value: string,
  ) => Promise<void>;
  persistComparisonTargetTranslation: (
    persistLayer: LayerDocType,
    targetItem: ComparisonTargetItem,
    group: ComparisonGroup,
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

export function TranscriptionTimelineComparisonGroupList({
  locale,
  visibleGroups,
  activeComparisonGroupId,
  activeComparisonCellId,
  comparisonTargetSide,
  contextMenuSourceUnitId,
  focusedLayerRowId,
  activeUnitId,
  comparisonDualGridStyle,
  comparisonEditorHeightByGroup,
  defaultComparisonEditorHeight,
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
  patchComparisonFocus,
  bundleOrdinalByKey,
  showBundleChips,
  comparisonHeaderOrthographies,
  buildComparisonHeaderMenuItems,
  openComparisonMenuAtPointer,
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
  resizingComparisonEditorId,
  comparisonResizeFontPreviewByLayerId,
  handleComparisonEditorResizeStart,
  translationDrafts,
  setTranslationDrafts,
  translationTextByLayer,
  unitDrafts,
  setUnitDrafts,
  focusedTranslationDraftKeyRef,
  saveStatusByCellKey,
  setComparisonCellSaveStatus,
  runComparisonSaveWithStatus,
  scheduleAutoSave,
  clearAutoSaveTimer,
  persistGroupTranslation,
  persistComparisonTargetTranslation,
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
}: TranscriptionTimelineComparisonGroupListProps) {
  return (
    <>
      {visibleGroups.map((group, groupIndex) => {
        const perSegTargetsPrimary = comparisonUsesSplitTargetEditors(group);
        const persistAnchorUnitIds = group.isMultiAnchorGroup
          ? group.sourceItems.map((s) => s.unitId)
          : Array.from(new Set(group.targetItems.flatMap((item) => item.anchorUnitIds)));
        const anchorUnitIds = persistAnchorUnitIds;
        const primaryUnitId = group.sourceItems[0]?.unitId ?? '';
        const primarySourceUnit = primaryUnitId ? unitByIdForSpeaker.get(primaryUnitId) : undefined;
        const groupTranslationLayers = filterTranslationLayersForComparisonGroup(
          group,
          translationLayers,
          transcriptionLayers,
          defaultTranscriptionLayerId,
          sourceLayer?.id,
          layerLinks,
        );
        const targetEmptyReason = groupTranslationLayers.length === 0
          ? resolveComparisonGroupEmptyReason(
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
        const anchorForUi = resolveComparisonGroupAnchorForUi(group, contextMenuSourceUnitId, activeUnitId);
        const derivedActive = activeUnitId != null && group.sourceItems.some((item) => item.unitId === activeUnitId);
        const isGroupActive = activeComparisonGroupId === group.id || (activeComparisonGroupId == null && derivedActive);
        const isTargetColumnFocused = isGroupActive && comparisonTargetSide === 'target';
        const comparisonLayoutMode: 'balanced' | 'one-to-many' | 'many-to-one' | 'many-to-many' = (() => {
          const sourceCount = group.sourceItems.length;
          const targetVisualRows = groupTranslationLayers.reduce((n, tl) => {
            if (tl.id === groupPreferredTargetLayer?.id) {
              return n + (perSegTargetsPrimary ? group.targetItems.length : 1);
            }
            if (!primarySourceUnit) return n + 1;
            const ex = resolveComparisonExplicitTargetItemsForLayer(
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
        const comparisonEditorGroupKey = `comparison-editor:${group.id}`;
        const comparisonEditorHeight = comparisonEditorHeightByGroup[comparisonEditorGroupKey] ?? defaultComparisonEditorHeight;
        const bundleKey = resolveComparisonHorizontalBundleKey(
          group,
          layerIdToHorizontalBundleRootId,
          sourceLayer?.id,
        );
        const bundleOrdinal = bundleOrdinalByKey.get(bundleKey) ?? null;
        const prevGroup = groupIndex > 0 ? visibleGroups[groupIndex - 1] : undefined;
        const startsNewBundle = groupIndex === 0
          || (prevGroup != null
            && resolveComparisonHorizontalBundleKey(
              group,
              layerIdToHorizontalBundleRootId,
              sourceLayer?.id,
            ) !== resolveComparisonHorizontalBundleKey(
              prevGroup,
              layerIdToHorizontalBundleRootId,
              sourceLayer?.id,
            ));
        const comparisonEditorResizingThisGroup = resizingComparisonEditorId === comparisonEditorGroupKey;
        const isTargetHeaderActive = comparisonTargetSide === 'target'
          || (comparisonTargetSide == null && translationLayers.some((l) => l.id === focusedLayerRowId));
        const isSourceHeaderActive = !isTargetHeaderActive;

        return (
          <div
            key={group.id}
            data-comparison-group-id={group.id}
            data-comparison-layout={comparisonLayoutMode}
            className={`timeline-comparison-group${isGroupActive ? ' timeline-comparison-group-active' : ''}${startsNewBundle ? ' timeline-comparison-group-bundle-start' : ''}`}
            style={{
              ...(comparisonDualGridStyle ?? {}),
              ...(comparisonEditorGroupKey in comparisonEditorHeightByGroup
                ? { '--timeline-comparison-editor-min-height': `${comparisonEditorHeight}px` }
                : {}),
            } as CSSProperties}
          >
            <div className="timeline-comparison-group-meta">
              <div className="timeline-comparison-group-meta-left">
                <div className="timeline-comparison-time">
                  {formatTime(group.startTime)} - {formatTime(group.endTime)}
                </div>
                {showBundleChips && startsNewBundle && bundleOrdinal ? (
                  <span className="timeline-comparison-chip timeline-comparison-chip-bundle">
                    {t(locale, 'transcription.comparison.bundleLabel')} {bundleOrdinal}
                  </span>
                ) : null}
                {group.speakerSummary.trim().length > 0 ? (
                  <span className="timeline-comparison-chip timeline-comparison-chip-speaker">
                    {group.speakerSummary}
                  </span>
                ) : null}
                {group.isMultiAnchorGroup ? (
                  <span className="timeline-comparison-chip timeline-comparison-chip-multi-anchor">
                    {t(locale, 'transcription.comparison.multiAnchor')}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="timeline-comparison-source-column">
              {group.sourceItems.map((item) => {
                const isSourceCardActive = item.unitId === activeUnitId || activeComparisonCellId === `source:${item.unitId}`;
                const sourceLayerId = item.layerId ?? sourceLayer?.id ?? '';
                const sourceDraftKey = `trc-${sourceLayerId || 'none'}-${item.unitId}`;
                const initialSourceText = normalizeComparisonText(item.text || '');
                const sourceDraft = unitDrafts[sourceDraftKey] ?? initialSourceText;
                const sourceRows = resolveComparisonEditorRows(sourceDraft);
                const sourceCellKey = `cmp-source:${sourceLayerId || 'none'}:${item.unitId}`;
                const sourceSaveStatus = saveStatusByCellKey[sourceCellKey];
                const isSourceDraftEmpty = normalizeComparisonText(sourceDraft).trim().length === 0;
                const sourceSelfCertainty = resolveSelfCertaintyForUnit?.(item.unitId, sourceLayerId || undefined);
                const sourceSelfCertaintyAmbiguous = !sourceSelfCertainty
                  && resolveSelfCertaintyAmbiguityForUnit?.(item.unitId, sourceLayerId || undefined) === true;
                const sourceNoteIndicator = resolveNoteIndicatorTarget?.(item.unitId, sourceLayerId || undefined) ?? null;
                const sourceBadge = renderComparisonOverlay({
                  locale,
                  certainty: sourceSelfCertainty,
                  ambiguous: sourceSelfCertaintyAmbiguous,
                  laneLabel: resolveComparisonLayerLabel(
                    transcriptionLayers.find((layer) => layer.id === sourceLayerId),
                    locale,
                    t(locale, 'transcription.comparison.sourceHeader'),
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
                const sourcePreviewFont = comparisonEditorResizingThisGroup && sourceLayerId
                  ? comparisonResizeFontPreviewByLayerId[sourceLayerId]
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
                        comparisonHeaderOrthographies,
                      ).trim();
                      return inline.length > 0
                        ? inline
                        : resolveComparisonLayerLabel(
                            sourceItemLayer,
                            locale,
                            t(locale, 'transcription.comparison.sourceHeader'),
                          );
                    })()
                  : t(locale, 'transcription.comparison.sourceHeader');
                const sourceRailAriaLabel = tf(locale, 'transcription.comparison.rowRailFocusLayer', { layer: sourceRowTitle });
                return (
                  <div key={item.unitId} className="timeline-comparison-editor-row timeline-comparison-editor-row-source">
                    <button
                      type="button"
                      className={`timeline-comparison-row-rail timeline-comparison-row-rail-source${isSourceHeaderActive ? ' is-active' : ''}`}
                      aria-pressed={isSourceHeaderActive}
                      aria-label={sourceRailAriaLabel}
                      title={sourceRowTitle}
                      data-testid={`comparison-source-rail-${group.id}-${item.unitId}`}
                      onClick={() => {
                        patchComparisonFocus({ comparisonTargetSide: 'source' });
                        if (sourceLayerId) onFocusLayer(sourceLayerId);
                      }}
                      onContextMenu={(event) => {
                        openComparisonMenuAtPointer(event, buildComparisonHeaderMenuItems(sourceItemLayer, sourceRowTitle));
                      }}
                    >
                      {renderComparisonRailLaneBody({
                        layer: sourceItemLayer,
                        renderLaneLabel,
                        fallbackTitle: sourceRowTitle,
                        mode: 'full',
                      })}
                    </button>
                    <TimelineDraftEditorSurface
                      multiline
                      wrapperClassName={[
                        'timeline-comparison-source-surface',
                        isSourceDraftEmpty ? 'timeline-comparison-source-surface-empty' : '',
                        isSourceCardActive ? 'timeline-comparison-source-surface-active' : '',
                        hasSourceBadge ? 'timeline-comparison-source-surface-has-self-certainty' : '',
                        hasSourceBadge ? 'timeline-comparison-source-surface-has-side-badges' : '',
                      ].filter(Boolean).join(' ')}
                      inputClassName={[
                        'timeline-comparison-source-card',
                        'timeline-comparison-source-input',
                        isSourceCardActive ? 'timeline-comparison-source-card-active' : '',
                        isSourceDraftEmpty ? 'timeline-comparison-source-card-empty' : '',
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
                        void runComparisonSaveWithStatus(sourceCellKey, async () => {
                          await persistSourceText(item.unitId, sourceDraft, sourceLayerId);
                        });
                      }}
                      onResizeHandlePointerDown={(event, edge) => {
                        handleComparisonEditorResizeStart(event, group.id, comparisonEditorHeight, edge);
                      }}
                      onFocus={() => {
                        patchComparisonFocus({
                          activeComparisonGroupId: group.id,
                          activeComparisonCellId: `source:${item.unitId}`,
                          comparisonTargetSide: 'source',
                          contextMenuSourceUnitId: item.unitId,
                        });
                        focusedTranslationDraftKeyRef.current = null;
                        if (sourceLayerId) onFocusLayer(sourceLayerId);
                      }}
                      onChange={(event) => {
                        const value = normalizeComparisonText(event.target.value);
                        patchComparisonFocus({
                          activeComparisonGroupId: group.id,
                          activeComparisonCellId: `source:${item.unitId}`,
                          comparisonTargetSide: 'source',
                        });
                        setUnitDrafts((prev) => ({ ...prev, [sourceDraftKey]: value }));
                        if (!sourceLayerId) return;
                        if (value !== initialSourceText) {
                          setComparisonCellSaveStatus(sourceCellKey, 'dirty');
                          scheduleAutoSave(`cmp-src-${sourceLayerId}-${item.unitId}`, async () => {
                            await runComparisonSaveWithStatus(sourceCellKey, async () => {
                              await persistSourceText(item.unitId, value, sourceLayerId);
                            });
                          });
                        } else {
                          clearAutoSaveTimer(`cmp-src-${sourceLayerId}-${item.unitId}`);
                          setComparisonCellSaveStatus(sourceCellKey);
                        }
                      }}
                      onBlur={(event) => {
                        const value = normalizeComparisonText(event.target.value);
                        if (!sourceLayerId) return;
                        clearAutoSaveTimer(`cmp-src-${sourceLayerId}-${item.unitId}`);
                        if (value !== initialSourceText) {
                          void runComparisonSaveWithStatus(sourceCellKey, async () => {
                            await persistSourceText(item.unitId, value, sourceLayerId);
                          });
                        } else {
                          setComparisonCellSaveStatus(sourceCellKey);
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
                          clearAutoSaveTimer(`cmp-src-${sourceLayerId}-${item.unitId}`);
                        }
                        setUnitDrafts((prev) => ({ ...prev, [sourceDraftKey]: initialSourceText }));
                        setComparisonCellSaveStatus(sourceCellKey);
                        event.currentTarget.blur();
                      }}
                      onClick={(event) => {
                        patchComparisonFocus({
                          activeComparisonGroupId: group.id,
                          activeComparisonCellId: `source:${item.unitId}`,
                          comparisonTargetSide: 'source',
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
                        patchComparisonFocus({
                          activeComparisonGroupId: group.id,
                          activeComparisonCellId: `source:${item.unitId}`,
                          comparisonTargetSide: 'source',
                          contextMenuSourceUnitId: item.unitId,
                        });
                        handleAnnotationContextMenu(item.unitId, unitToView(unitDoc, sourceLayerId), sourceLayerId, event);
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <div
              className={`timeline-comparison-target-column${isTargetColumnFocused ? ' timeline-comparison-target-column-active' : ''}`}
              data-comparison-translation-layer-count={groupTranslationLayers.length}
            >
              {groupTranslationLayers.length === 0 ? (
                <div
                  className="timeline-comparison-target-empty"
                  data-testid={`comparison-target-empty-${group.id}`}
                >
                  <p className="timeline-comparison-target-empty-hint">
                    {targetEmptyReason === 'orphan-needs-repair'
                      ? t(locale, 'transcription.comparison.orphanTranslationLayerNeedsRepair')
                      : t(locale, 'transcription.comparison.noChildTranslationLayers')}
                  </p>
                </div>
              ) : (
                groupTranslationLayers.map((tLayer) => {
                  const isPrimaryLayer = tLayer.id === groupPreferredTargetLayer?.id;
                  const layerTargetItems: ComparisonTargetItem[] = isPrimaryLayer
                    ? group.targetItems
                    : (() => {
                        if (!primarySourceUnit) {
                          return [{
                            id: `${group.id}:${tLayer.id}:placeholder`,
                            text: '',
                            anchorUnitIds: primaryUnitId ? [primaryUnitId] : [],
                          }];
                        }
                        const explicit = resolveComparisonExplicitTargetItemsForLayer(
                          primarySourceUnit,
                          tLayer,
                          defaultTranscriptionLayerId,
                          segmentsByLayer,
                          segmentContentByLayer,
                          unitByIdForSpeaker,
                        );
                        if (explicit != null && explicit.length > 0) return explicit;
                        const plain = resolveComparisonTargetPlainTextForLayer(
                          primarySourceUnit,
                          tLayer,
                          defaultTranscriptionLayerId,
                          segmentsByLayer,
                          segmentContentByLayer,
                          translationTextByLayer,
                          unitByIdForSpeaker,
                        );
                        return buildComparisonTargetItemsFromRawText(primarySourceUnit.id, plain);
                      })();
                  const layerPerSeg = isPrimaryLayer ? perSegTargetsPrimary : layerTargetItems.length > 1;
                  const layerHeaderLabel = resolveComparisonLayerLabel(
                    tLayer,
                    locale,
                    t(locale, 'transcription.comparison.translationHeader'),
                  );
                  const layerHeaderContent = (() => {
                    const inline = buildLaneHeaderInlineDotSeparatedLabel(
                      tLayer,
                      locale,
                      comparisonHeaderOrthographies,
                    ).trim();
                    return inline.length > 0 ? inline : layerHeaderLabel;
                  })();
                  const translationSegmentsForAudio = segmentsByLayer?.get(tLayer.id) ?? [];
                  const audioAnchorSeg = layerUsesOwnSegments(tLayer, defaultTranscriptionLayerId)
                    ? pickTranslationSegmentForPersist(translationSegmentsForAudio, group.startTime, group.endTime)
                    : undefined;
                  const audioScopeUnitId = resolveComparisonTranslationAudioScopeUnitId({
                    audioAnchorSeg,
                    anchorUnitIds,
                    contextMenuSourceUnitId,
                    activeUnitId,
                    primaryUnitId,
                    translationAudioByLayer,
                    targetLayerId: tLayer.id,
                  });
                  const voiceSourceDoc = unitByIdForSpeaker.get(audioScopeUnitId) ?? primarySourceUnit;
                  const layerNoteIndicator = anchorForUi.unitId
                    ? resolveNoteIndicatorTarget?.(anchorForUi.unitId, tLayer.id) ?? null
                    : null;
                  const audioTranslation = translationAudioByLayer?.get(tLayer.id)?.get(audioScopeUnitId);
                  const audioMedia = audioTranslation?.translationAudioMediaId
                    ? mediaItemById.get(audioTranslation.translationAudioMediaId)
                    : undefined;
                  const isCurrentRecording = recording && recordingUnitId === audioScopeUnitId && recordingLayerId === tLayer.id;
                  const canRecordLayerAudio = Boolean(startRecordingForUnit)
                    && (tLayer.acceptsAudio === true || tLayer.modality === 'mixed');
                  const shouldShowLayerAudio = Boolean(audioMedia) || isCurrentRecording || canRecordLayerAudio;
                  const layerAudioControls = shouldShowLayerAudio && voiceSourceDoc ? (
                    <TimelineTranslationAudioControls
                      {...(audioMedia ? { mediaItem: audioMedia } : {})}
                      isRecording={isCurrentRecording}
                      disabled={recording && !isCurrentRecording}
                      compact
                      onStartRecording={() => {
                        void startRecordingForUnit?.(voiceSourceDoc, tLayer);
                      }}
                      {...(stopRecording ? { onStopRecording: stopRecording } : {})}
                      {...(audioMedia && deleteVoiceTranslation ? {
                        onDeleteRecording: () => deleteVoiceTranslation(voiceSourceDoc, tLayer),
                      } : {})}
                      {...(tLayer.modality === 'mixed' && transcribeVoiceTranslation && audioMedia
                        ? {
                            onTranscribeRecording: () => {
                              const b = readNonEmptyAudioBlobFromMediaItem(audioMedia);
                              return transcribeVoiceTranslation(voiceSourceDoc, tLayer, b ? { audioBlob: b } : undefined);
                            },
                          }
                        : {})}
                    />
                  ) : null;
                  const layerPreviewFont = comparisonEditorResizingThisGroup
                    ? comparisonResizeFontPreviewByLayerId[tLayer.id]
                    : undefined;
                  const layerTypography = buildOrthographyPreviewTextProps(
                    resolveOrthographyRenderPolicy(tLayer.languageId, orthographies, tLayer.orthographyId),
                    layerPreviewFont != null
                      ? { ...tLayer.displaySettings, fontSize: layerPreviewFont }
                      : tLayer.displaySettings,
                  );
                  const layerDraftKeyBase = `cmp:${tLayer.id}:${group.id}`;
                  const layerCellKeyBase = `cmp-target:${tLayer.id}:${group.id}`;
                  const cmpAutoSaveKey = `cmp-${tLayer.id}-${group.id}`;

                  return (
                    <div key={tLayer.id} className="timeline-comparison-target-layer-stack">
                      {layerPerSeg
                        ? layerTargetItems.map((targetItem, ti) => {
                            const itemDraftKey = `${layerDraftKeyBase}:${targetItem.id}`;
                            const itemInitial = normalizeComparisonText(targetItem.text || '');
                            const itemDraft = translationDrafts[itemDraftKey] ?? itemInitial;
                            const itemCellKey = `${layerCellKeyBase}:${targetItem.id}`;
                            const itemSaveStatus = saveStatusByCellKey[itemCellKey];
                            const isItemDraftEmpty = normalizeComparisonText(itemDraft).trim().length === 0;
                            const isThisTargetRowActive = isGroupActive && comparisonTargetSide === 'target'
                              && activeComparisonCellId === `target:${group.id}:${tLayer.id}:${targetItem.id}`;
                            const segAutoSaveKey = `cmp-seg-${tLayer.id}-${group.id}-${targetItem.id}`;
                            const buildCombinedTargetValue = (nextValue: string): string => (
                              layerTargetItems
                                .map((item) => {
                                  if (item.id === targetItem.id) return normalizeComparisonText(nextValue);
                                  const otherDraftKey = `${layerDraftKeyBase}:${item.id}`;
                                  return normalizeComparisonText(translationDrafts[otherDraftKey] ?? item.text ?? '');
                                })
                                .join('\n')
                            );
                            return (
                              <div key={`${tLayer.id}-${targetItem.id}`} className="timeline-comparison-editor-row timeline-comparison-editor-row-target">
                                <button
                                  type="button"
                                  className={`timeline-comparison-row-rail timeline-comparison-row-rail-target${isTargetHeaderActive ? ' is-active' : ''}`}
                                  aria-pressed={isTargetHeaderActive}
                                  aria-label={tf(locale, 'transcription.comparison.rowRailFocusLayer', { layer: layerHeaderContent })}
                                  title={layerHeaderContent}
                                  data-testid={`comparison-target-rail-${group.id}-${tLayer.id}-${targetItem.id}`}
                                  onClick={() => {
                                    patchComparisonFocus({ comparisonTargetSide: 'target' });
                                    onFocusLayer(tLayer.id);
                                  }}
                                  onContextMenu={(event) => {
                                    openComparisonMenuAtPointer(event, buildComparisonHeaderMenuItems(tLayer, layerHeaderContent));
                                  }}
                                >
                                  {renderComparisonRailLaneBody({
                                    layer: tLayer,
                                    renderLaneLabel,
                                    fallbackTitle: layerHeaderContent,
                                    mode: layerPerSeg && ti > 0 ? 'continuation' : 'full',
                                  })}
                                </button>
                                <TimelineDraftEditorSurface
                                  multiline
                                  wrapperClassName={[
                                    'timeline-comparison-target-surface',
                                    isItemDraftEmpty ? 'timeline-comparison-target-surface-empty' : '',
                                    isThisTargetRowActive ? 'timeline-comparison-target-surface-active' : '',
                                    layerNoteIndicator ? 'timeline-comparison-target-surface-has-side-badges' : '',
                                  ].filter(Boolean).join(' ')}
                                  inputClassName={[
                                    'timeline-comparison-target-input',
                                    isItemDraftEmpty ? 'timeline-comparison-target-input-empty' : '',
                                  ].filter(Boolean).join(' ')}
                                  value={itemDraft}
                                  rows={resolveComparisonEditorRows(itemDraft)}
                                  placeholder={t(locale, 'transcription.timeline.placeholder.translation')}
                                  {...(layerTypography.dir ? { dir: layerTypography.dir } : {})}
                                  inputStyle={layerTypography.style}
                                  {...(itemSaveStatus !== undefined ? { saveStatus: itemSaveStatus } : {})}
                                  overlay={renderComparisonOverlay({
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
                                    handleComparisonEditorResizeStart(event, group.id, comparisonEditorHeight, edge);
                                  }}
                                  onRetry={() => {
                                    void runComparisonSaveWithStatus(itemCellKey, async () => {
                                      await persistComparisonTargetTranslation(
                                        tLayer,
                                        targetItem,
                                        group,
                                        persistAnchorUnitIds,
                                        normalizeComparisonText(itemDraft),
                                        buildCombinedTargetValue(itemDraft),
                                      );
                                    });
                                  }}
                                  {...(ti === 0 && layerAudioControls ? { tools: layerAudioControls } : {})}
                                  toolsClassName="timeline-comparison-target-tools"
                                  onFocus={() => {
                                    patchComparisonFocus({
                                      activeComparisonGroupId: group.id,
                                      activeComparisonCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                      comparisonTargetSide: 'target',
                                      contextMenuSourceUnitId: anchorForUi.unitId || primaryUnitId || null,
                                    });
                                    focusedTranslationDraftKeyRef.current = itemDraftKey;
                                    onFocusLayer(tLayer.id);
                                  }}
                                  onChange={(event) => {
                                    const value = normalizeComparisonText(event.target.value);
                                    patchComparisonFocus({
                                      activeComparisonGroupId: group.id,
                                      activeComparisonCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                      comparisonTargetSide: 'target',
                                    });
                                    setTranslationDrafts((prev) => ({ ...prev, [itemDraftKey]: value }));
                                    if (value !== itemInitial) {
                                      setComparisonCellSaveStatus(itemCellKey, 'dirty');
                                      scheduleAutoSave(segAutoSaveKey, async () => {
                                        await runComparisonSaveWithStatus(itemCellKey, async () => {
                                          await persistComparisonTargetTranslation(
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
                                      setComparisonCellSaveStatus(itemCellKey);
                                    }
                                  }}
                                  onBlur={(event) => {
                                    focusedTranslationDraftKeyRef.current = null;
                                    const value = normalizeComparisonText(event.target.value);
                                    clearAutoSaveTimer(segAutoSaveKey);
                                    if (value !== itemInitial) {
                                      void runComparisonSaveWithStatus(itemCellKey, async () => {
                                        await persistComparisonTargetTranslation(
                                          tLayer,
                                          targetItem,
                                          group,
                                          persistAnchorUnitIds,
                                          value,
                                          buildCombinedTargetValue(value),
                                        );
                                      });
                                    } else {
                                      setComparisonCellSaveStatus(itemCellKey);
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
                                    setComparisonCellSaveStatus(itemCellKey);
                                    event.currentTarget.blur();
                                  }}
                                  onClick={(event) => {
                                    if (!anchorForUi.unitId) return;
                                    patchComparisonFocus({
                                      activeComparisonGroupId: group.id,
                                      activeComparisonCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                      comparisonTargetSide: 'target',
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
                                    patchComparisonFocus({
                                      activeComparisonGroupId: group.id,
                                      activeComparisonCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                      comparisonTargetSide: 'target',
                                    });
                                    handleAnnotationContextMenu(menuSourceId, unitToView(menuUnitDoc, tLayer.id), tLayer.id, event);
                                  }}
                                />
                              </div>
                            );
                          })
                        : (() => {
                            const draftKey = layerDraftKeyBase;
                            const initialTargetText = layerTargetItems.map((item) => item.text).join('\n');
                            const draft = translationDrafts[draftKey] ?? initialTargetText;
                            const targetCellKey = layerCellKeyBase;
                            const targetSaveStatus = saveStatusByCellKey[targetCellKey];
                            const isTargetDraftEmpty = normalizeComparisonText(draft).trim().length === 0;
                            const isMergedTargetRowActive = isGroupActive && comparisonTargetSide === 'target'
                              && activeComparisonCellId === `target:${group.id}:${tLayer.id}:editor`;
                            return (
                              <div className="timeline-comparison-editor-row timeline-comparison-editor-row-target">
                                <button
                                  type="button"
                                  className={`timeline-comparison-row-rail timeline-comparison-row-rail-target${isTargetHeaderActive ? ' is-active' : ''}`}
                                  aria-pressed={isTargetHeaderActive}
                                  aria-label={tf(locale, 'transcription.comparison.rowRailFocusLayer', { layer: layerHeaderContent })}
                                  title={layerHeaderContent}
                                  data-testid={`comparison-target-rail-${group.id}-${tLayer.id}`}
                                  onClick={() => {
                                    patchComparisonFocus({ comparisonTargetSide: 'target' });
                                    onFocusLayer(tLayer.id);
                                  }}
                                  onContextMenu={(event) => {
                                    openComparisonMenuAtPointer(event, buildComparisonHeaderMenuItems(tLayer, layerHeaderContent));
                                  }}
                                >
                                  {renderComparisonRailLaneBody({
                                    layer: tLayer,
                                    renderLaneLabel,
                                    fallbackTitle: layerHeaderContent,
                                    mode: 'full',
                                  })}
                                </button>
                                <TimelineDraftEditorSurface
                                  multiline
                                  wrapperClassName={[
                                    'timeline-comparison-target-surface',
                                    isTargetDraftEmpty ? 'timeline-comparison-target-surface-empty' : '',
                                    isMergedTargetRowActive ? 'timeline-comparison-target-surface-active' : '',
                                    layerNoteIndicator ? 'timeline-comparison-target-surface-has-side-badges' : '',
                                  ].filter(Boolean).join(' ')}
                                  inputClassName={[
                                    'timeline-comparison-target-input',
                                    isTargetDraftEmpty ? 'timeline-comparison-target-input-empty' : '',
                                  ].filter(Boolean).join(' ')}
                                  value={draft}
                                  rows={resolveComparisonEditorRows(draft)}
                                  placeholder={t(locale, 'transcription.timeline.placeholder.translation')}
                                  {...(isPrimaryLayer && group.editingTargetPolicy === 'multi-target-items'
                                    ? { title: t(locale, 'transcription.comparison.multiTargetHint') }
                                    : {})}
                                  {...(layerTypography.dir ? { dir: layerTypography.dir } : {})}
                                  inputStyle={layerTypography.style}
                                  {...(targetSaveStatus !== undefined ? { saveStatus: targetSaveStatus } : {})}
                                  overlay={renderComparisonOverlay({
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
                                    handleComparisonEditorResizeStart(event, group.id, comparisonEditorHeight, edge);
                                  }}
                                  onRetry={() => {
                                    void runComparisonSaveWithStatus(targetCellKey, async () => {
                                      await persistGroupTranslation(
                                        tLayer,
                                        group,
                                        persistAnchorUnitIds,
                                        normalizeComparisonText(draft),
                                      );
                                    });
                                  }}
                                  {...(layerAudioControls ? { tools: layerAudioControls } : {})}
                                  toolsClassName="timeline-comparison-target-tools"
                                  onFocus={() => {
                                    patchComparisonFocus({
                                      activeComparisonGroupId: group.id,
                                      activeComparisonCellId: `target:${group.id}:${tLayer.id}:editor`,
                                      comparisonTargetSide: 'target',
                                      contextMenuSourceUnitId: anchorForUi.unitId || primaryUnitId || null,
                                    });
                                    focusedTranslationDraftKeyRef.current = draftKey;
                                    onFocusLayer(tLayer.id);
                                  }}
                                  onChange={(event) => {
                                    const value = normalizeComparisonText(event.target.value);
                                    patchComparisonFocus({
                                      activeComparisonGroupId: group.id,
                                      activeComparisonCellId: `target:${group.id}:${tLayer.id}:editor`,
                                      comparisonTargetSide: 'target',
                                    });
                                    setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
                                    if (value !== initialTargetText) {
                                      setComparisonCellSaveStatus(targetCellKey, 'dirty');
                                      scheduleAutoSave(cmpAutoSaveKey, async () => {
                                        await runComparisonSaveWithStatus(targetCellKey, async () => {
                                          await persistGroupTranslation(tLayer, group, persistAnchorUnitIds, value);
                                        });
                                      });
                                    } else {
                                      clearAutoSaveTimer(cmpAutoSaveKey);
                                      setComparisonCellSaveStatus(targetCellKey);
                                    }
                                  }}
                                  onBlur={(event) => {
                                    focusedTranslationDraftKeyRef.current = null;
                                    const value = normalizeComparisonText(event.target.value);
                                    clearAutoSaveTimer(cmpAutoSaveKey);
                                    if (value !== initialTargetText) {
                                      void runComparisonSaveWithStatus(targetCellKey, async () => {
                                        await persistGroupTranslation(tLayer, group, persistAnchorUnitIds, value);
                                      });
                                    } else {
                                      setComparisonCellSaveStatus(targetCellKey);
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
                                    clearAutoSaveTimer(cmpAutoSaveKey);
                                    setTranslationDrafts((prev) => ({ ...prev, [draftKey]: initialTargetText }));
                                    setComparisonCellSaveStatus(targetCellKey);
                                    event.currentTarget.blur();
                                  }}
                                  onClick={(event) => {
                                    if (!anchorForUi.unitId) return;
                                    patchComparisonFocus({
                                      activeComparisonGroupId: group.id,
                                      activeComparisonCellId: `target:${group.id}:${tLayer.id}:editor`,
                                      comparisonTargetSide: 'target',
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
                                    patchComparisonFocus({
                                      activeComparisonGroupId: group.id,
                                      activeComparisonCellId: `target:${group.id}:${tLayer.id}:editor`,
                                      comparisonTargetSide: 'target',
                                    });
                                    handleAnnotationContextMenu(menuSourceId, unitToView(menuUnitDoc, tLayer.id), tLayer.id, event);
                                  }}
                                />
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
