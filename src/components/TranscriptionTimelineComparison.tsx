import '../styles/pages/timeline/timeline-comparison.css';
import type { LayerDocType, LayerUnitContentDocType, LayerUnitDocType, MediaItemDocType } from '../db';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { unitToView } from '../hooks/timelineUnitView';
import { layerUsesOwnSegments, resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import { t, useLocale } from '../i18n';
import type { TranscriptionComparisonViewFocusState } from '../pages/TranscriptionPage.UIState';
import { DEFAULT_TRANSCRIPTION_COMPARISON_FOCUS } from '../pages/TranscriptionPage.UIState';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';
import { normalizeSpeakerFocusKey, resolveSpeakerFocusKeyFromSegment } from './transcriptionTimelineSegmentSpeakerLayout';
import { buildComparisonGroups, listSegmentsOverlappingTimeRange, pickTranslationSegmentForPersist, type ComparisonGroup } from '../utils/transcriptionComparisonGroups';
import { formatTime, normalizeSingleLine } from '../utils/transcriptionFormatters';

function normalizeComparisonText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => normalizeSingleLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function mergeComparisonUnitById(
  unitsOnCurrentMedia: LayerUnitDocType[],
  segmentParentUnitLookup: LayerUnitDocType[] | undefined,
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined,
): Map<string, LayerUnitDocType> {
  const next = new Map<string, LayerUnitDocType>();
  for (const u of unitsOnCurrentMedia) next.set(u.id, u);
  if (segmentParentUnitLookup) {
    for (const u of segmentParentUnitLookup) {
      if (!next.has(u.id)) next.set(u.id, u);
    }
  }
  if (segmentsByLayer) {
    for (const list of segmentsByLayer.values()) {
      for (const s of list) {
        if (!next.has(s.id)) next.set(s.id, s);
      }
    }
  }
  return next;
}

function resolveComparisonGroupSourceUnits(input: {
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  unitsOnCurrentMedia: LayerUnitDocType[];
  segmentParentUnitLookup: LayerUnitDocType[] | undefined;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined;
  allLayersOrdered: LayerDocType[] | undefined;
  defaultTranscriptionLayerId: string | undefined;
  activeSpeakerFilterKey: string | undefined;
  unitByIdForSpeaker: ReadonlyMap<string, LayerUnitDocType>;
}): LayerUnitDocType[] {
  const {
    transcriptionLayers,
    translationLayers,
    unitsOnCurrentMedia,
    segmentParentUnitLookup: _segmentParentUnitLookup,
    segmentsByLayer,
    allLayersOrdered,
    defaultTranscriptionLayerId,
    activeSpeakerFilterKey,
    unitByIdForSpeaker,
  } = input;

  const filteredHostUnits = unitsOnCurrentMedia.filter((u) => u.tags?.skipProcessing !== true);

  const hasSegmentTranscriptionLane = transcriptionLayers.some(
    (l) => layerUsesOwnSegments(l, defaultTranscriptionLayerId),
  );
  if (!hasSegmentTranscriptionLane) {
    return filteredHostUnits;
  }

  const layerById = new Map(
    (allLayersOrdered ?? [...transcriptionLayers, ...translationLayers]).map((l) => [l.id, l] as const),
  );

  const speakerKey = activeSpeakerFilterKey ?? 'all';
  const seen = new Set<string>();
  const out: LayerUnitDocType[] = [];

  const push = (u: LayerUnitDocType) => {
    if (u.tags?.skipProcessing === true) return;
    if (seen.has(u.id)) return;
    seen.add(u.id);
    out.push(u);
  };

  for (const layer of transcriptionLayers) {
    if (layerUsesOwnSegments(layer, defaultTranscriptionLayerId)) {
      const segmentSourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
      const segmentSourceLayerId = segmentSourceLayer?.id ?? '';
      const segs = segmentsByLayer?.get(segmentSourceLayerId) ?? [];
      for (const segment of segs) {
        if (speakerKey !== 'all') {
          const k = resolveSpeakerFocusKeyFromSegment(segment, unitByIdForSpeaker);
          if (k !== normalizeSpeakerFocusKey(speakerKey)) continue;
        }
        push(segment);
      }
    } else {
      for (const u of unitsOnCurrentMedia) {
        if (u.tags?.skipProcessing === true) continue;
        const lid = typeof u.layerId === 'string' ? u.layerId.trim() : '';
        if (lid.length > 0 && lid !== layer.id) continue;
        push(u);
      }
    }
  }

  if (out.length === 0) {
    return filteredHostUnits;
  }

  return out.sort((left, right) => left.startTime - right.startTime || left.endTime - right.endTime || left.id.localeCompare(right.id));
}

function resolveComparisonLayerLabel(layer: LayerDocType | undefined, locale: string, fallback: string): string {
  if (!layer) return fallback;
  const localizedName = typeof layer.name === 'string'
    ? layer.name
    : layer.name?.[locale]
      ?? layer.name?.['zh-CN']
      ?? layer.name?.['en-US']
      ?? Object.values(layer.name ?? {}).find((value) => typeof value === 'string' && value.trim().length > 0)
      ?? '';
  const normalized = normalizeSingleLine(localizedName);
  if (normalized.length > 0) return normalized;
  if (typeof layer.key === 'string' && layer.key.trim().length > 0) return layer.key.trim();
  return fallback;
}

interface TranscriptionTimelineComparisonProps {
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  unitsOnCurrentMedia: LayerUnitDocType[];
  focusedLayerRowId: string;
  activeUnitId?: string;
  onFocusLayer: (layerId: string) => void;
  comparisonFocus?: TranscriptionComparisonViewFocusState;
  updateComparisonFocus?: (patch: Partial<TranscriptionComparisonViewFocusState>) => void;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  saveSegmentContentForLayer?: (segmentId: string, layerId: string, value: string) => Promise<void>;
  handleAnnotationClick: (
    uttId: string,
    uttStartTime: number,
    layerId: string,
    e: React.MouseEvent,
    overlapCycleItems?: Array<{ id: string; startTime: number }>,
  ) => void;
  handleAnnotationContextMenu?: (
    uttId: string,
    utt: ReturnType<typeof unitToView>,
    layerId: string,
    e: React.MouseEvent,
  ) => void;
  /** 与纯文本时间轴一致：语段轨时从 segmentsByLayer 取行，而非仅用宿主句列表 */
  segmentsByLayer?: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentParentUnitLookup?: LayerUnitDocType[];
  allLayersOrdered?: LayerDocType[];
  defaultTranscriptionLayerId?: string;
  activeSpeakerFilterKey?: string;
  translationAudioByLayer?: Map<string, Map<string, LayerUnitContentDocType>>;
  mediaItems?: MediaItemDocType[];
  recording?: boolean;
  recordingUnitId?: string | null;
  recordingLayerId?: string | null;
  startRecordingForUnit?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  stopRecording?: () => void;
  deleteVoiceTranslation?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
}

/**
 * 左右对照视图（P0）| Side-by-side comparison view (P0)
 */
export function TranscriptionTimelineComparison({
  transcriptionLayers,
  translationLayers,
  unitsOnCurrentMedia,
  focusedLayerRowId,
  activeUnitId,
  onFocusLayer,
  comparisonFocus: comparisonFocusProp,
  updateComparisonFocus,
  segmentContentByLayer,
  saveSegmentContentForLayer,
  handleAnnotationClick,
  handleAnnotationContextMenu,
  segmentsByLayer,
  segmentParentUnitLookup,
  allLayersOrdered,
  defaultTranscriptionLayerId,
  activeSpeakerFilterKey,
  translationAudioByLayer,
  mediaItems = [],
  recording = false,
  recordingUnitId = null,
  recordingLayerId = null,
  startRecordingForUnit,
  stopRecording,
  deleteVoiceTranslation,
}: TranscriptionTimelineComparisonProps) {
  const locale = useLocale();
  const [internalComparisonFocus, setInternalComparisonFocus] = useState<TranscriptionComparisonViewFocusState>(
    () => ({ ...DEFAULT_TRANSCRIPTION_COMPARISON_FOCUS }),
  );
  const comparisonFocus = comparisonFocusProp != null && updateComparisonFocus != null
    ? comparisonFocusProp
    : internalComparisonFocus;
  const patchComparisonFocus = useCallback((patch: Partial<TranscriptionComparisonViewFocusState>) => {
    if (updateComparisonFocus != null) {
      updateComparisonFocus(patch);
    } else {
      setInternalComparisonFocus((prev) => ({ ...prev, ...patch }));
    }
  }, [updateComparisonFocus]);
  const activeComparisonGroupId = comparisonFocus.activeComparisonGroupId;
  const activeComparisonCellId = comparisonFocus.activeComparisonCellId;
  const comparisonTargetSide = comparisonFocus.comparisonTargetSide;
  const contextMenuSourceUnitId = comparisonFocus.contextMenuSourceUnitId;
  const [compactMode, setCompactMode] = useState<'both' | 'source' | 'target'>('both');
  const {
    unitDrafts,
    setUnitDrafts,
    translationDrafts,
    setTranslationDrafts,
    translationTextByLayer,
    focusedTranslationDraftKeyRef,
    scheduleAutoSave,
    clearAutoSaveTimer,
    saveUnitText,
    saveUnitLayerText,
    getUnitTextForLayer,
    renderLaneLabel,
  } = useTranscriptionEditorContext();

  const targetLayer = useMemo(
    () => translationLayers.find((layer) => layer.id === focusedLayerRowId) ?? translationLayers[0],
    [focusedLayerRowId, translationLayers],
  );

  const sourceLayer = useMemo(
    () => transcriptionLayers.find((layer) => layer.id === focusedLayerRowId) ?? transcriptionLayers[0],
    [focusedLayerRowId, transcriptionLayers],
  );

  const unitByIdForSpeaker = useMemo(
    () => mergeComparisonUnitById(unitsOnCurrentMedia, segmentParentUnitLookup, segmentsByLayer),
    [unitsOnCurrentMedia, segmentParentUnitLookup, segmentsByLayer],
  );

  const comparisonGroupSourceUnits = useMemo(
    () => resolveComparisonGroupSourceUnits({
      transcriptionLayers,
      translationLayers,
      unitsOnCurrentMedia,
      segmentParentUnitLookup,
      segmentsByLayer,
      allLayersOrdered,
      defaultTranscriptionLayerId,
      activeSpeakerFilterKey,
      unitByIdForSpeaker,
    }),
    [
      activeSpeakerFilterKey,
      allLayersOrdered,
      defaultTranscriptionLayerId,
      segmentParentUnitLookup,
      segmentsByLayer,
      transcriptionLayers,
      translationLayers,
      unitByIdForSpeaker,
      unitsOnCurrentMedia,
    ],
  );

  const unitById = unitByIdForSpeaker;

  const mediaItemById = useMemo(
    () => new Map(mediaItems.map((item) => [item.id, item] as const)),
    [mediaItems],
  );

  const groups = useMemo(() => {
    const targetUsesSegments = Boolean(
      targetLayer && layerUsesOwnSegments(targetLayer, defaultTranscriptionLayerId),
    );
    const translationSegmentsForTarget = targetLayer ? segmentsByLayer?.get(targetLayer.id) : undefined;
    const targetLayerId = targetLayer?.id ?? '';
    const layerContent = targetLayerId && segmentContentByLayer
      ? segmentContentByLayer.get(targetLayerId)
      : undefined;
    return buildComparisonGroups({
      units: comparisonGroupSourceUnits,
      sourceLayerIds: transcriptionLayers.map((layer) => layer.id),
      getSourceText: (unit) => getUnitTextForLayer(unit, sourceLayer?.id) || getUnitTextForLayer(unit) || '',
      getTargetText: (unit) => {
        if (!targetLayer) return '';
        if (targetUsesSegments && layerContent) {
          const overlapping = listSegmentsOverlappingTimeRange(
            translationSegmentsForTarget,
            unit.startTime,
            unit.endTime,
          );
          if (overlapping.length === 0) {
            return translationTextByLayer.get(targetLayer.id)?.get(unit.id)?.text ?? '';
          }
          return overlapping
            .map((s) => layerContent.get(s.id)?.text ?? '')
            .filter((line) => line.length > 0)
            .join('\n');
        }
        return translationTextByLayer.get(targetLayer.id)?.get(unit.id)?.text ?? '';
      },
    });
  }, [
    comparisonGroupSourceUnits,
    defaultTranscriptionLayerId,
    getUnitTextForLayer,
    segmentContentByLayer,
    segmentsByLayer,
    sourceLayer?.id,
    targetLayer,
    transcriptionLayers,
    translationTextByLayer,
  ]);

  const persistGroupTranslation = useCallback(async (group: ComparisonGroup, anchorUnitIds: string[], value: string) => {
    if (!targetLayer) return;
    const usesSeg = layerUsesOwnSegments(targetLayer, defaultTranscriptionLayerId);
    if (usesSeg && saveSegmentContentForLayer) {
      const trSegs = segmentsByLayer?.get(targetLayer.id) ?? [];
      const pick = pickTranslationSegmentForPersist(trSegs, group.startTime, group.endTime);
      if (pick?.id) {
        await saveSegmentContentForLayer(pick.id, targetLayer.id, value);
        return;
      }
    }
    await Promise.all(anchorUnitIds.map((unitId) => saveUnitLayerText(unitId, value, targetLayer.id)));
  }, [
    defaultTranscriptionLayerId,
    saveSegmentContentForLayer,
    saveUnitLayerText,
    segmentsByLayer,
    targetLayer,
  ]);

  const persistSourceText = useCallback(async (unitId: string, value: string, layerId?: string) => {
    await saveUnitText(unitId, value, layerId);
  }, [saveUnitText]);

  const bundleOrderById = useMemo(() => {
    const map = new Map<string, number>();
    let nextIndex = 1;
    for (const group of groups) {
      if (!group.bundleRootId || map.has(group.bundleRootId)) continue;
      map.set(group.bundleRootId, nextIndex);
      nextIndex += 1;
    }
    return map;
  }, [groups]);

  const sourceHeaderLabel = useMemo(
    () => resolveComparisonLayerLabel(sourceLayer, locale, t(locale, 'transcription.comparison.sourceHeader')),
    [locale, sourceLayer],
  );

  const targetHeaderLabel = useMemo(
    () => resolveComparisonLayerLabel(targetLayer, locale, t(locale, 'transcription.comparison.translationHeader')),
    [locale, targetLayer],
  );

  const sourceHeaderContent = sourceLayer ? (renderLaneLabel(sourceLayer) ?? sourceHeaderLabel) : sourceHeaderLabel;
  const targetHeaderContent = targetLayer ? (renderLaneLabel(targetLayer) ?? targetHeaderLabel) : targetHeaderLabel;

  const showBundleChips = bundleOrderById.size > 1;
  const isTargetHeaderActive = comparisonTargetSide === 'target' || (comparisonTargetSide == null && targetLayer?.id === focusedLayerRowId);
  const isSourceHeaderActive = !isTargetHeaderActive;

  useEffect(() => {
    if (!activeUnitId) {
      patchComparisonFocus({
        activeComparisonGroupId: null,
        activeComparisonCellId: null,
        comparisonTargetSide: null,
        contextMenuSourceUnitId: null,
      });
      return;
    }

    const matchedGroup = groups.find((group) => group.sourceItems.some((item) => item.unitId === activeUnitId));
    if (!matchedGroup) {
      patchComparisonFocus({
        activeComparisonGroupId: null,
        activeComparisonCellId: null,
        comparisonTargetSide: null,
        contextMenuSourceUnitId: null,
      });
      return;
    }

    const syncedSide = targetLayer?.id === focusedLayerRowId ? 'target' : 'source';
    patchComparisonFocus({
      activeComparisonGroupId: matchedGroup.id,
      activeComparisonCellId: syncedSide === 'target'
        ? `target:${matchedGroup.id}:editor`
        : `source:${activeUnitId}`,
      comparisonTargetSide: syncedSide,
      contextMenuSourceUnitId: activeUnitId,
    });
  }, [activeUnitId, focusedLayerRowId, groups, patchComparisonFocus, targetLayer?.id]);

  if (groups.length === 0) {
    return (
      <div
        className="timeline-comparison-view timeline-comparison-view-empty"
        role="status"
        aria-live="polite"
      >
        <p className="timeline-comparison-empty-hint">
          {translationLayers.length === 0
            ? t(locale, 'transcription.toolbar.comparisonRequiresTranslationLayer')
            : t(locale, 'transcription.comparison.emptyGroups')}
        </p>
      </div>
    );
  }

  return (
    <div className="timeline-comparison-view" data-testid="timeline-comparison-view" data-compact-mode={compactMode}>
      <div className="timeline-comparison-toolbar">
        <div className="timeline-comparison-mode-toggle" role="group" aria-label={t(locale, 'transcription.comparison.columnMode')}>
          <button
            type="button"
            className={`timeline-comparison-mode-btn${compactMode === 'both' ? ' is-active' : ''}`}
            aria-pressed={compactMode === 'both'}
            onClick={() => setCompactMode('both')}
          >
            {t(locale, 'transcription.comparison.allColumns')}
          </button>
          <button
            type="button"
            className={`timeline-comparison-mode-btn${compactMode === 'source' ? ' is-active' : ''}`}
            aria-pressed={compactMode === 'source'}
            onClick={() => setCompactMode('source')}
          >
            {t(locale, 'transcription.comparison.sourceOnly')}
          </button>
          <button
            type="button"
            className={`timeline-comparison-mode-btn${compactMode === 'target' ? ' is-active' : ''}`}
            aria-pressed={compactMode === 'target'}
            onClick={() => setCompactMode('target')}
          >
            {t(locale, 'transcription.comparison.translationOnly')}
          </button>
        </div>
      </div>
      <div className="timeline-comparison-header" role="group" aria-label={t(locale, 'transcription.comparison.columnMode')}>
        <button
          type="button"
          className={`timeline-comparison-header-cell timeline-comparison-header-btn${isSourceHeaderActive ? ' is-active' : ''}`}
          aria-pressed={isSourceHeaderActive}
          onClick={() => {
            patchComparisonFocus({ comparisonTargetSide: 'source' });
            if (sourceLayer?.id) onFocusLayer(sourceLayer.id);
          }}
        >
          <span className="timeline-comparison-header-content">{sourceHeaderContent}</span>
        </button>
        <button
          type="button"
          className={`timeline-comparison-header-cell timeline-comparison-header-btn${isTargetHeaderActive ? ' is-active' : ''}`}
          aria-pressed={isTargetHeaderActive}
          onClick={() => {
            patchComparisonFocus({ comparisonTargetSide: 'target' });
            if (targetLayer?.id) onFocusLayer(targetLayer.id);
          }}
        >
          <span className="timeline-comparison-header-content">{targetHeaderContent}</span>
        </button>
      </div>

      {groups.map((group, groupIndex) => {
        const draftKey = targetLayer ? `cmp:${targetLayer.id}:${group.id}` : `cmp:none:${group.id}`;
        const anchorUnitIds = Array.from(new Set(group.targetItems.flatMap((item) => item.anchorUnitIds)));
        const initialTargetText = group.targetItems.map((item) => item.text).join('\n');
        const draft = translationDrafts[draftKey] ?? initialTargetText;
        const draftLines = normalizeComparisonText(draft)
          .split('\n')
          .filter((line, index, lines) => line.length > 0 || lines.length === 1);
        const primaryUnitId = group.sourceItems[0]?.unitId ?? '';
        const primarySourceUnit = primaryUnitId ? unitById.get(primaryUnitId) : undefined;
        const translationSegmentsForAudio = targetLayer ? segmentsByLayer?.get(targetLayer.id) ?? [] : [];
        const audioAnchorSeg = targetLayer && layerUsesOwnSegments(targetLayer, defaultTranscriptionLayerId)
          ? pickTranslationSegmentForPersist(translationSegmentsForAudio, group.startTime, group.endTime)
          : undefined;
        const derivedActive = activeUnitId != null && group.sourceItems.some((item) => item.unitId === activeUnitId);
        const isGroupActive = activeComparisonGroupId === group.id || (activeComparisonGroupId == null && derivedActive);
        const isTargetActive = isGroupActive && comparisonTargetSide === 'target';
        const audioScopeId = audioAnchorSeg?.id ?? primarySourceUnit?.id ?? '';
        const bundleOrdinal = group.bundleRootId ? bundleOrderById.get(group.bundleRootId) ?? null : null;
        const startsNewBundle = groupIndex === 0 || group.bundleRootId !== groups[groupIndex - 1]?.bundleRootId;
        const audioTranslation = targetLayer ? translationAudioByLayer?.get(targetLayer.id)?.get(audioScopeId) : undefined;
        const audioMedia = audioTranslation?.translationAudioMediaId
          ? mediaItemById.get(audioTranslation.translationAudioMediaId)
          : undefined;
        const isCurrentRecording = recording && recordingUnitId === audioScopeId && recordingLayerId === targetLayer?.id;
        const shouldShowAudioControls = Boolean(audioMedia) || isCurrentRecording;
        const audioControls = shouldShowAudioControls && targetLayer && primarySourceUnit ? (
          <TimelineTranslationAudioControls
            {...(audioMedia ? { mediaItem: audioMedia } : {})}
            isRecording={isCurrentRecording}
            onStartRecording={() => {
              void startRecordingForUnit?.(primarySourceUnit, targetLayer);
            }}
            {...(stopRecording ? { onStopRecording: stopRecording } : {})}
            {...(audioMedia && deleteVoiceTranslation ? {
              onDeleteRecording: () => deleteVoiceTranslation(primarySourceUnit, targetLayer),
            } : {})}
          />
        ) : null;

        return (
          <div
            key={group.id}
            className={`timeline-comparison-group${isGroupActive ? ' timeline-comparison-group-active' : ''}${startsNewBundle ? ' timeline-comparison-group-bundle-start' : ''}`}
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
                const sourceRows = Math.min(6, Math.max(2, sourceDraft.split('\n').length));
                return (
                  <textarea
                    key={item.unitId}
                    className={`timeline-comparison-source-card timeline-comparison-source-input${isSourceCardActive ? ' timeline-comparison-source-card-active' : ''}`}
                    value={sourceDraft}
                    rows={sourceRows}
                    placeholder={t(locale, 'transcription.timeline.placeholder.segment')}
                    disabled={!sourceLayerId}
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
                      scheduleAutoSave(`cmp-src-${sourceLayerId}-${item.unitId}`, async () => {
                        await persistSourceText(item.unitId, value, sourceLayerId);
                      });
                    }}
                    onBlur={(event) => {
                      const value = normalizeComparisonText(event.target.value);
                      if (!sourceLayerId) return;
                      clearAutoSaveTimer(`cmp-src-${sourceLayerId}-${item.unitId}`);
                      if (value !== initialSourceText) {
                        void persistSourceText(item.unitId, value, sourceLayerId);
                      }
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
                      const unitDoc = unitById.get(item.unitId);
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
                );
              })}
            </div>

            <div className={`timeline-comparison-target-column${isTargetActive ? ' timeline-comparison-target-column-active' : ''}`}>
              <textarea
                className="timeline-comparison-target-input"
                value={draft}
                rows={Math.min(6, Math.max(2, draftLines.length))}
                placeholder={t(locale, 'transcription.timeline.placeholder.translation')}
                title={group.editingTargetPolicy === 'multi-target-items'
                  ? t(locale, 'transcription.comparison.multiTargetHint')
                  : undefined}
                disabled={!targetLayer}
                onFocus={() => {
                  patchComparisonFocus({
                    activeComparisonGroupId: group.id,
                    activeComparisonCellId: `target:${group.id}:editor`,
                    comparisonTargetSide: 'target',
                    contextMenuSourceUnitId: primaryUnitId || null,
                  });
                  focusedTranslationDraftKeyRef.current = draftKey;
                  if (targetLayer?.id) onFocusLayer(targetLayer.id);
                }}
                onChange={(event) => {
                  const value = normalizeComparisonText(event.target.value);
                  patchComparisonFocus({
                    activeComparisonGroupId: group.id,
                    activeComparisonCellId: `target:${group.id}:editor`,
                    comparisonTargetSide: 'target',
                  });
                  setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
                  if (!targetLayer) return;
                  scheduleAutoSave(`cmp-${targetLayer.id}-${group.id}`, async () => {
                    await persistGroupTranslation(group, anchorUnitIds, value);
                  });
                }}
                onBlur={(event) => {
                  focusedTranslationDraftKeyRef.current = null;
                  if (!targetLayer) return;
                  const value = normalizeComparisonText(event.target.value);
                  clearAutoSaveTimer(`cmp-${targetLayer.id}-${group.id}`);
                  if (value !== initialTargetText) {
                    void persistGroupTranslation(group, anchorUnitIds, value);
                  }
                }}
                onClick={(event) => {
                  if (!primaryUnitId || !targetLayer?.id) return;
                  patchComparisonFocus({
                    activeComparisonGroupId: group.id,
                    activeComparisonCellId: `target:${group.id}:editor`,
                    comparisonTargetSide: 'target',
                    contextMenuSourceUnitId: primaryUnitId,
                  });
                  handleAnnotationClick(primaryUnitId, group.startTime, targetLayer.id, event);
                }}
                onContextMenu={(event) => {
                  if (!handleAnnotationContextMenu || !targetLayer?.id) return;
                  const menuSourceId = contextMenuSourceUnitId != null
                    && group.sourceItems.some((si) => si.unitId === contextMenuSourceUnitId)
                    ? contextMenuSourceUnitId
                    : primaryUnitId;
                  const menuUnitDoc = menuSourceId ? unitById.get(menuSourceId) : undefined;
                  if (!menuUnitDoc) return;
                  patchComparisonFocus({
                    activeComparisonGroupId: group.id,
                    activeComparisonCellId: `target:${group.id}:editor`,
                    comparisonTargetSide: 'target',
                  });
                  handleAnnotationContextMenu(menuSourceId, unitToView(menuUnitDoc, targetLayer.id), targetLayer.id, event);
                }}
              />
              {audioControls ? (
                <div className="timeline-comparison-target-tools">
                  {audioControls}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
