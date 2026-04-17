/**
 * 选中层的语段列表 | Segment list for the focused layer
 */
import { liveQuery } from 'dexie';
import { useEffect, useMemo, useState } from 'react';
import type { LayerDocType, LayerSegmentViewDocType, LayerUnitContentViewDocType, LayerUnitDocType, LayerUnitStatus, NoteCategory, SegmentMetaDocType, SpeakerDocType } from '../db';
import { createTimelineUnit, type TimelineUnit } from '../hooks/transcriptionTypes';
import { resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { formatTime } from '../utils/transcriptionFormatters';
import { type UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { ANNOTATION_STATUS_ORDER as SEGMENT_ANNOTATION_STATUS_ORDER, CERTAINTY_ORDER as SEGMENT_CERTAINTY_ORDER, NOTE_CATEGORY_ORDER as SEGMENT_NOTE_CATEGORY_ORDER, SOURCE_TYPE_ORDER as SEGMENT_SOURCE_TYPE_ORDER, getAnnotationStatusLabel as getSegmentAnnotationStatusLabel, getCertaintyLabel as getSegmentCertaintyLabel, getContentStateLabel as getSegmentContentStateLabel, getNoteCategoryLabel as getSegmentNoteCategoryLabel, getSourceTypeLabel as getSegmentSourceTypeLabel, resolveSpeakerLabel as resolveSegmentSpeakerLabel, type SegmentContentStateFilter } from './sidePaneSegmentListViewModel';
import { SegmentMetaService } from '../services/SegmentMetaService';

interface SidePaneSidebarSegmentListProps {
  focusedLayerRowId: string;
  messages: SidePaneSidebarMessages;
  layers?: LayerDocType[];
  defaultTranscriptionLayerId?: string;
  segmentsByLayer?: ReadonlyMap<string, LayerSegmentViewDocType[]>;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentViewDocType>>;
  unitsOnCurrentMedia?: LayerUnitDocType[];
  speakers?: SpeakerDocType[];
  getUnitTextForLayer?: (unit: LayerUnitDocType, layerId?: string) => string;
  onSelectTimelineUnit?: (unit: TimelineUnit) => void;
}

type SegmentSourceType = NonNullable<SegmentMetaDocType['sourceType']>;

type SegmentListItem = {
  key: string;
  unit: TimelineUnit;
  startTime: number;
  endTime: number;
  text: string;
  empty: boolean;
  hasText: boolean;
  speakerKeys: string[];
  speakerLabels: string[];
  noteCategories: NoteCategory[];
  certainty?: UnitSelfCertainty | undefined;
  annotationStatus?: LayerUnitStatus | undefined;
  sourceType?: SegmentSourceType | undefined;
  textSource?: 'meta' | 'live-layer' | 'unit-default' | 'none' | undefined;
  searchIndex: string;
};

type FacetOption = {
  value: string;
  label: string;
  count: number;
};

export function SidePaneSidebarSegmentList(props: SidePaneSidebarSegmentListProps) {
  const {
    focusedLayerRowId,
    messages,
    layers = [],
    defaultTranscriptionLayerId,
    segmentsByLayer,
    segmentContentByLayer,
    unitsOnCurrentMedia,
    speakers = [],
    getUnitTextForLayer,
    onSelectTimelineUnit,
  } = props;

  const [filterText, setFilterText] = useState('');
  const [contentStateFilter, setContentStateFilter] = useState<'' | SegmentContentStateFilter>('');
  const [speakerFilter, setSpeakerFilter] = useState('');
  const [noteCategoryFilter, setNoteCategoryFilter] = useState('');
  const [certaintyFilter, setCertaintyFilter] = useState<'' | UnitSelfCertainty>('');
  const [annotationStatusFilter, setAnnotationStatusFilter] = useState<'' | LayerUnitStatus>('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<'' | SegmentSourceType>('');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [segmentMetaRows, setSegmentMetaRows] = useState<SegmentMetaDocType[]>([]);
  const [segmentMetaLoading, setSegmentMetaLoading] = useState(false);
  const [segmentMetaHydrated, setSegmentMetaHydrated] = useState(false);
  const mediaUnits = unitsOnCurrentMedia ?? [];

  const speakerById = useMemo(
    () => new Map(speakers.map((speaker) => [speaker.id, speaker] as const)),
    [speakers],
  );
  const layerById = useMemo(
    () => new Map(layers.map((layer) => [layer.id, layer] as const)),
    [layers],
  );
  const focusedLayer = useMemo(
    () => layerById.get(focusedLayerRowId),
    [focusedLayerRowId, layerById],
  );
  const sourceLayer = useMemo(
    () => (focusedLayer ? resolveSegmentTimelineSourceLayer(focusedLayer, layerById, defaultTranscriptionLayerId) : undefined),
    [defaultTranscriptionLayerId, focusedLayer, layerById],
  );

  const activeMediaId = useMemo(() => {
    const unitMediaId = mediaUnits.find((unit) => (unit.mediaId?.trim() ?? '').length > 0)?.mediaId?.trim();
    if (unitMediaId) return unitMediaId;

    const sourceLayerId = sourceLayer?.id ?? focusedLayer?.id;
    if (!sourceLayerId) return '';
    return segmentsByLayer?.get(sourceLayerId)?.find((segment) => (segment.mediaId?.trim() ?? '').length > 0)?.mediaId?.trim() ?? '';
  }, [focusedLayer, mediaUnits, segmentsByLayer, sourceLayer]);

  const sourceLayerId = sourceLayer?.id ?? focusedLayer?.id ?? '';
  const sourceSegments = useMemo(() => {
    if (!sourceLayerId) return [];
    const rows = segmentsByLayer?.get(sourceLayerId) ?? [];
    const mediaId = activeMediaId.trim();
    return mediaId ? rows.filter((segment) => (segment.mediaId?.trim() ?? '') === mediaId) : rows;
  }, [activeMediaId, segmentsByLayer, sourceLayerId]);
  const unitById = useMemo(
    () => new Map(mediaUnits.map((unit) => [unit.id, unit] as const)),
    [mediaUnits],
  );

  const segmentListLoading = useMemo(() => {
    const hasFocusedLayer = focusedLayerRowId.trim().length > 0;
    const hasSourceLayerHint = Boolean(sourceLayer?.id ?? focusedLayer?.id);
    const waitingScopeHydration = unitsOnCurrentMedia === undefined || segmentsByLayer === undefined;
    return hasFocusedLayer && hasSourceLayerHint && !activeMediaId.trim() && waitingScopeHydration;
  }, [activeMediaId, focusedLayer, focusedLayerRowId, segmentsByLayer, sourceLayer, unitsOnCurrentMedia]);

  useEffect(() => {
    const layerId = focusedLayerRowId.trim();
    const mediaId = activeMediaId.trim();
    if (!layerId || !mediaId) {
      setSegmentMetaRows([]);
      setSegmentMetaLoading(false);
      setSegmentMetaHydrated(false);
      return () => undefined;
    }

    setSegmentMetaLoading(true);
    setSegmentMetaHydrated(false);
    let cancelled = false;
    const subscription = liveQuery(() => SegmentMetaService.listByLayerMedia(layerId, mediaId)).subscribe({
      next: (rows) => {
        if (cancelled) return;
        setSegmentMetaRows(rows);
        setSegmentMetaLoading(false);
        setSegmentMetaHydrated(true);
      },
      error: () => {
        if (!cancelled) {
          setSegmentMetaRows([]);
          setSegmentMetaLoading(false);
          setSegmentMetaHydrated(true);
        }
      },
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [activeMediaId, focusedLayerRowId]);

  useEffect(() => {
    const layerId = focusedLayerRowId.trim();
    const mediaId = activeMediaId.trim();
    const hasRawItems = sourceSegments.length > 0
      || mediaUnits.some((unit) => (unit.mediaId?.trim() ?? '') === mediaId);
    if (!segmentMetaHydrated || segmentMetaLoading || !layerId || !mediaId || !hasRawItems || segmentMetaRows.length > 0) {
      return () => undefined;
    }

    void SegmentMetaService.rebuildForLayerMedia(layerId, mediaId).catch(() => undefined);
    return () => undefined;
  }, [activeMediaId, focusedLayerRowId, mediaUnits, segmentMetaHydrated, segmentMetaLoading, segmentMetaRows.length, sourceSegments.length]);

  const fallbackItems = useMemo<SegmentListItem[]>(() => {
    const resolveLiveText = (unit: LayerUnitDocType | undefined, layerId?: string): {
      text: string;
      source: SegmentListItem['textSource'];
    } => {
      if (!unit) return { text: '', source: 'none' };
      const runtimeText = getUnitTextForLayer?.(unit, layerId)?.trim() ?? '';
      if (runtimeText.length > 0) return { text: runtimeText, source: 'live-layer' };
      const defaultText = unit.transcription?.default?.trim() ?? '';
      if (defaultText.length > 0) return { text: defaultText, source: 'unit-default' };
      return { text: '', source: 'none' };
    };

    const resolveLinkedUnit = (segment: LayerSegmentViewDocType): LayerUnitDocType | undefined => {
      const explicitUnitId = (segment.parentUnitId ?? segment.unitId)?.trim();
      if (explicitUnitId) {
        const explicitMatch = unitById.get(explicitUnitId);
        if (explicitMatch) return explicitMatch;
      }

      const sameIdMatch = unitById.get(segment.id);
      if (sameIdMatch) return sameIdMatch;

      const exactTimingMatch = mediaUnits.find((unit) => {
        const sameMedia = (unit.mediaId?.trim() ?? '') === (segment.mediaId?.trim() ?? '');
        return sameMedia
          && Math.abs(unit.startTime - segment.startTime) < 0.05
          && Math.abs(unit.endTime - segment.endTime) < 0.05;
      });
      if (exactTimingMatch) return exactTimingMatch;

      return mediaUnits.find((unit) => {
        const sameMedia = (unit.mediaId?.trim() ?? '') === (segment.mediaId?.trim() ?? '');
        return sameMedia
          && unit.startTime <= segment.startTime + 0.01
          && unit.endTime >= segment.endTime - 0.01;
      });
    };

    if (sourceSegments.length > 0) {
      return sourceSegments.map((segment): SegmentListItem => {
        const linkedUnit = resolveLinkedUnit(segment);
        const segmentTextLayerIds = [...new Set([focusedLayerRowId, sourceLayerId].filter((value): value is string => value.trim().length > 0))];
        const directSegmentText = segmentTextLayerIds
          .map((layerId) => segmentContentByLayer?.get(layerId)?.get(segment.id)?.text?.trim() ?? '')
          .find((value) => value.length > 0) ?? '';
        const liveText = directSegmentText.length > 0
          ? { text: directSegmentText, source: 'live-layer' as const }
          : resolveLiveText(linkedUnit, focusedLayerRowId || sourceLayerId || undefined);
        const text = liveText.text;
        const speakerKey = segment.speakerId?.trim() || linkedUnit?.speakerId?.trim() || '';
        const speakerLabel = speakerKey ? resolveSegmentSpeakerLabel(speakerKey, speakerById) : '';
        const certainty = linkedUnit?.selfCertainty;
        const annotationStatus = linkedUnit?.status;
        const empty = text.length === 0;
        const searchIndex = text.toLowerCase();

        return {
          key: `${focusedLayerRowId}::fallback::${segment.id}`,
          unit: createTimelineUnit(sourceLayerId || focusedLayerRowId, segment.id, 'segment'),
          startTime: segment.startTime,
          endTime: segment.endTime,
          text,
          empty,
          hasText: !empty,
          speakerKeys: speakerKey ? [speakerKey] : [],
          speakerLabels: speakerLabel ? [speakerLabel] : [],
          noteCategories: [],
          textSource: liveText.source,
          ...(certainty ? { certainty } : {}),
          ...(annotationStatus ? { annotationStatus } : {}),
          searchIndex,
        };
      });
    }

    return mediaUnits
      .filter((unit) => !activeMediaId.trim() || (unit.mediaId?.trim() ?? '') === activeMediaId.trim())
      .map((unit): SegmentListItem => {
        const liveText = resolveLiveText(unit, focusedLayerRowId || undefined);
        const text = liveText.text;
        const speakerKey = unit.speakerId?.trim() ?? '';
        const speakerLabel = speakerKey ? resolveSegmentSpeakerLabel(speakerKey, speakerById) : '';
        const certainty = unit.selfCertainty;
        const annotationStatus = unit.status;
        const empty = text.length === 0;
        const searchIndex = text.toLowerCase();

        return {
          key: `${focusedLayerRowId}::fallback::${unit.id}`,
          unit: createTimelineUnit(focusedLayerRowId, unit.id, 'unit'),
          startTime: unit.startTime,
          endTime: unit.endTime,
          text,
          empty,
          hasText: !empty,
          speakerKeys: speakerKey ? [speakerKey] : [],
          speakerLabels: speakerLabel ? [speakerLabel] : [],
          noteCategories: [],
          textSource: liveText.source,
          ...(certainty ? { certainty } : {}),
          ...(annotationStatus ? { annotationStatus } : {}),
          searchIndex,
        };
      });
  }, [activeMediaId, focusedLayerRowId, getUnitTextForLayer, mediaUnits, messages, segmentContentByLayer, sourceLayerId, sourceSegments, speakerById, unitById]);

  const items = useMemo<SegmentListItem[]>(() => {
    const metaItems: SegmentListItem[] = segmentMetaRows.map((row): SegmentListItem => {
    const text = row.text.trim();
    const speakerKey = row.effectiveSpeakerId?.trim() ?? '';
    const fallbackSpeakerLabel = speakerKey ? resolveSegmentSpeakerLabel(speakerKey, speakerById) : '';
    const speakerLabel = row.effectiveSpeakerName?.trim() || fallbackSpeakerLabel;
    const speakerKeys = speakerKey ? [speakerKey] : [];
    const speakerLabels = speakerLabel ? [speakerLabel] : [];
    const noteCategories = row.noteCategoryKeys ?? [];
    const certainty = row.effectiveSelfCertainty;
    const annotationStatus = row.annotationStatus;
    const sourceType = row.sourceType;
    const timelineLayerId = row.unitKind === 'segment'
      ? (sourceLayer?.id ?? row.layerId)
      : row.layerId;
    const empty = !row.hasText;
    const searchIndex = text.toLowerCase();

      return {
        key: row.id,
        unit: createTimelineUnit(timelineLayerId, row.segmentId, row.unitKind ?? 'segment'),
        startTime: row.startTime,
        endTime: row.endTime,
        text,
        empty,
        hasText: row.hasText,
        speakerKeys,
        speakerLabels,
        noteCategories,
        ...(certainty ? { certainty } : {}),
        ...(annotationStatus ? { annotationStatus } : {}),
        ...(sourceType ? { sourceType } : {}),
        textSource: 'meta',
        searchIndex,
      };
    });

    if (fallbackItems.length === 0) {
      return metaItems.sort((left, right) => {
        if (left.startTime !== right.startTime) return left.startTime - right.startTime;
        if (left.endTime !== right.endTime) return left.endTime - right.endTime;
        return left.key.localeCompare(right.key);
      });
    }

    const mergedByUnitKey = new Map<string, SegmentListItem>();
    for (const item of fallbackItems) {
      mergedByUnitKey.set(`${item.unit.kind}:${item.unit.unitId}`, item);
    }
    for (const item of metaItems) {
      const unitKey = `${item.unit.kind}:${item.unit.unitId}`;
      const liveItem = mergedByUnitKey.get(unitKey);
      if (!liveItem) {
        mergedByUnitKey.set(unitKey, item);
        continue;
      }

      const mergedText = item.unit.kind === 'unit'
        ? (liveItem.hasText ? liveItem.text : item.text)
        : (liveItem.textSource === 'live-layer'
            ? liveItem.text
            : (item.hasText ? item.text : liveItem.text));
      const mergedHasText = liveItem.hasText || item.hasText;
      const mergedEmpty = !mergedHasText;
      const mergedSpeakerKeys = liveItem.speakerKeys.length > 0 ? liveItem.speakerKeys : item.speakerKeys;
      const mergedSpeakerLabels = liveItem.speakerLabels.length > 0 ? liveItem.speakerLabels : item.speakerLabels;
      const mergedNoteCategories = item.noteCategories.length > 0 ? item.noteCategories : liveItem.noteCategories;
      const mergedCertainty = liveItem.certainty ?? item.certainty;
      const mergedAnnotationStatus = liveItem.annotationStatus ?? item.annotationStatus;
      const mergedSourceType = item.sourceType ?? liveItem.sourceType;

      mergedByUnitKey.set(unitKey, {
        ...item,
        text: mergedText,
        empty: mergedEmpty,
        hasText: mergedHasText,
        startTime: liveItem.startTime,
        endTime: liveItem.endTime,
        speakerKeys: mergedSpeakerKeys,
        speakerLabels: mergedSpeakerLabels,
        noteCategories: mergedNoteCategories,
        searchIndex: `${liveItem.searchIndex} ${item.searchIndex}`.trim().toLowerCase(),
        ...(mergedCertainty ? { certainty: mergedCertainty } : {}),
        ...(mergedAnnotationStatus ? { annotationStatus: mergedAnnotationStatus } : {}),
        ...(mergedSourceType ? { sourceType: mergedSourceType } : {}),
      });
    }

    return [...mergedByUnitKey.values()].sort((left, right) => {
      if (left.startTime !== right.startTime) return left.startTime - right.startTime;
      if (left.endTime !== right.endTime) return left.endTime - right.endTime;
      return left.key.localeCompare(right.key);
    });
  }, [fallbackItems, messages, segmentMetaRows, sourceLayerId, speakerById]);

  const contentStateOptions = useMemo<FacetOption[]>(() => {
    const withTextCount = items.filter((item) => item.hasText).length;
    const emptyTextCount = items.length - withTextCount;
    const options: FacetOption[] = [];
    if (withTextCount > 0) {
      options.push({
        value: 'has_text',
        label: getSegmentContentStateLabel('has_text', messages),
        count: withTextCount,
      });
    }
    if (emptyTextCount > 0) {
      options.push({
        value: 'empty_text',
        label: getSegmentContentStateLabel('empty_text', messages),
        count: emptyTextCount,
      });
    }
    return options;
  }, [items, messages]);

  const speakerOptions = useMemo<FacetOption[]>(() => {
    const counter = new Map<string, FacetOption>();
    for (const item of items) {
      for (const key of [...new Set(item.speakerKeys)]) {
        const existing = counter.get(key);
        if (existing) {
          existing.count += 1;
          continue;
        }
        counter.set(key, {
          value: key,
          label: resolveSegmentSpeakerLabel(key, speakerById),
          count: 1,
        });
      }
    }
    return [...counter.values()].sort((left, right) => left.label.localeCompare(right.label, 'zh-Hans-CN'));
  }, [items, speakerById]);

  const noteCategoryOptions = useMemo<FacetOption[]>(() => SEGMENT_NOTE_CATEGORY_ORDER.flatMap((category) => {
    const count = items.filter((item) => item.noteCategories.includes(category)).length;
    return count > 0
      ? [{ value: category, label: getSegmentNoteCategoryLabel(category, messages), count }]
      : [];
  }), [items, messages]);

  const certaintyOptions = useMemo<FacetOption[]>(() => SEGMENT_CERTAINTY_ORDER.flatMap((certainty) => {
    const count = items.filter((item) => item.certainty === certainty).length;
    return count > 0
      ? [{ value: certainty, label: getSegmentCertaintyLabel(certainty, messages), count }]
      : [];
  }), [items, messages]);

  const annotationStatusOptions = useMemo<FacetOption[]>(() => SEGMENT_ANNOTATION_STATUS_ORDER.flatMap((status) => {
    const count = items.filter((item) => item.annotationStatus === status).length;
    return count > 0
      ? [{ value: status, label: getSegmentAnnotationStatusLabel(status, messages), count }]
      : [];
  }), [items, messages]);

  const sourceTypeOptions = useMemo<FacetOption[]>(() => SEGMENT_SOURCE_TYPE_ORDER.flatMap((sourceType) => {
    const count = items.filter((item) => item.sourceType === sourceType).length;
    return count > 0
      ? [{ value: sourceType, label: getSegmentSourceTypeLabel(sourceType, messages), count }]
      : [];
  }), [items, messages]);

  useEffect(() => {
    if (contentStateFilter && !contentStateOptions.some((option) => option.value === contentStateFilter)) {
      setContentStateFilter('');
    }
  }, [contentStateFilter, contentStateOptions]);

  useEffect(() => {
    if (speakerFilter && !speakerOptions.some((option) => option.value === speakerFilter)) {
      setSpeakerFilter('');
    }
  }, [speakerFilter, speakerOptions]);

  useEffect(() => {
    if (noteCategoryFilter && !noteCategoryOptions.some((option) => option.value === noteCategoryFilter)) {
      setNoteCategoryFilter('');
    }
  }, [noteCategoryFilter, noteCategoryOptions]);

  useEffect(() => {
    if (certaintyFilter && !certaintyOptions.some((option) => option.value === certaintyFilter)) {
      setCertaintyFilter('');
    }
  }, [certaintyFilter, certaintyOptions]);

  useEffect(() => {
    if (annotationStatusFilter && !annotationStatusOptions.some((option) => option.value === annotationStatusFilter)) {
      setAnnotationStatusFilter('');
    }
  }, [annotationStatusFilter, annotationStatusOptions]);

  useEffect(() => {
    if (sourceTypeFilter && !sourceTypeOptions.some((option) => option.value === sourceTypeFilter)) {
      setSourceTypeFilter('');
    }
  }, [sourceTypeFilter, sourceTypeOptions]);

  const filtered = useMemo(() => {
    const keyword = filterText.trim().toLowerCase();
    return items.filter((item) => {
      if (keyword && !item.searchIndex.includes(keyword)) return false;
      if (contentStateFilter === 'has_text' && !item.hasText) return false;
      if (contentStateFilter === 'empty_text' && item.hasText) return false;
      if (speakerFilter && !item.speakerKeys.includes(speakerFilter)) return false;
      if (noteCategoryFilter && !item.noteCategories.includes(noteCategoryFilter as NoteCategory)) return false;
      if (certaintyFilter && item.certainty !== certaintyFilter) return false;
      if (annotationStatusFilter && item.annotationStatus !== annotationStatusFilter) return false;
      if (sourceTypeFilter && item.sourceType !== sourceTypeFilter) return false;
      return true;
    });
  }, [annotationStatusFilter, certaintyFilter, contentStateFilter, filterText, items, noteCategoryFilter, sourceTypeFilter, speakerFilter]);

  const hasActiveFilters = filterText.trim().length > 0
    || contentStateFilter
    || speakerFilter
    || noteCategoryFilter
    || certaintyFilter
    || annotationStatusFilter
    || sourceTypeFilter;
  const hasFacetFilters = contentStateOptions.length > 0
    || speakerOptions.length > 0
    || noteCategoryOptions.length > 0
    || certaintyOptions.length > 0
    || annotationStatusOptions.length > 0
    || sourceTypeOptions.length > 0;
  const activeFacetCount = [contentStateFilter, speakerFilter, noteCategoryFilter, certaintyFilter, annotationStatusFilter, sourceTypeFilter]
    .filter((value) => Boolean(value)).length;
  const visibleCount = filtered.length;
  const totalCount = items.length;

  return (
    <section className="app-side-pane-group app-side-pane-segment-list-group" aria-label={messages.segmentListAria}>
      <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static app-side-pane-segment-list-heading" role="presentation">
        <div className="app-side-pane-segment-list-heading-copy">
          <span className="app-side-pane-section-title">{messages.segmentListTitle}</span>
          <p className="app-side-pane-segment-list-heading-subtitle">{messages.segmentListSubtitle}</p>
        </div>
        <span className="app-side-pane-segment-list-heading-badge" aria-label={`${visibleCount}/${totalCount}`}>
          {hasActiveFilters ? `${visibleCount}/${totalCount}` : totalCount}
        </span>
      </div>
      <div className="app-side-pane-segment-list-filter">
        <div className="app-side-pane-segment-list-filter-toolbar">
          <div className="app-side-pane-segment-list-search-shell">
            <span className="app-side-pane-segment-list-search-icon" aria-hidden="true">
              <svg viewBox="0 0 20 20" className="app-side-pane-segment-list-search-icon-svg" focusable="false">
                <circle cx="8.5" cy="8.5" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 12l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="text"
              className="app-side-pane-segment-list-filter-input"
              placeholder=""
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              aria-label={messages.segmentListFilterPlaceholder}
            />
          </div>
          {hasFacetFilters ? (
            <div className={`app-side-pane-segment-list-filter-box${isFilterMenuOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className="app-side-pane-segment-list-filter-trigger"
                aria-expanded={isFilterMenuOpen}
                onClick={() => setIsFilterMenuOpen((value) => !value)}
              >
                <span className="app-side-pane-segment-list-filter-trigger-label">{messages.segmentListFilterButton}</span>
                {activeFacetCount > 0 ? (
                  <span className="app-side-pane-segment-list-filter-trigger-count">{activeFacetCount}</span>
                ) : null}
                <span className="app-side-pane-segment-list-filter-trigger-caret" aria-hidden="true">▾</span>
              </button>
              {isFilterMenuOpen ? (
                <div className="app-side-pane-segment-list-filter-panel">
                  <div className="app-side-pane-segment-list-filter-grid">
                    {contentStateOptions.length > 0 ? (
                      <label className="app-side-pane-segment-list-filter-field">
                        <span className="app-side-pane-segment-list-filter-label">{messages.segmentListContentFilterLabel}</span>
                        <select
                          className="app-side-pane-segment-list-filter-select"
                          value={contentStateFilter}
                          onChange={(e) => setContentStateFilter(e.target.value as '' | SegmentContentStateFilter)}
                          aria-label={messages.segmentListContentFilterLabel}
                        >
                          <option value="">{messages.speakerFilterAllLabel}</option>
                          {contentStateOptions.map((option) => (
                            <option key={option.value} value={option.value}>{`${option.label} (${option.count})`}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {annotationStatusOptions.length > 0 ? (
                      <label className="app-side-pane-segment-list-filter-field">
                        <span className="app-side-pane-segment-list-filter-label">{messages.segmentListAnnotationStatusFilterLabel}</span>
                        <select
                          className="app-side-pane-segment-list-filter-select"
                          value={annotationStatusFilter}
                          onChange={(e) => setAnnotationStatusFilter(e.target.value as '' | LayerUnitStatus)}
                          aria-label={messages.segmentListAnnotationStatusFilterLabel}
                        >
                          <option value="">{messages.speakerFilterAllLabel}</option>
                          {annotationStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>{`${option.label} (${option.count})`}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {sourceTypeOptions.length > 0 ? (
                      <label className="app-side-pane-segment-list-filter-field">
                        <span className="app-side-pane-segment-list-filter-label">{messages.segmentListSourceTypeFilterLabel}</span>
                        <select
                          className="app-side-pane-segment-list-filter-select"
                          value={sourceTypeFilter}
                          onChange={(e) => setSourceTypeFilter(e.target.value as '' | SegmentSourceType)}
                          aria-label={messages.segmentListSourceTypeFilterLabel}
                        >
                          <option value="">{messages.speakerFilterAllLabel}</option>
                          {sourceTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>{`${option.label} (${option.count})`}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {speakerOptions.length > 0 ? (
                      <label className="app-side-pane-segment-list-filter-field">
                        <span className="app-side-pane-segment-list-filter-label">{messages.segmentListSpeakerFilterLabel}</span>
                        <select
                          className="app-side-pane-segment-list-filter-select"
                          value={speakerFilter}
                          onChange={(e) => setSpeakerFilter(e.target.value)}
                          aria-label={messages.segmentListSpeakerFilterLabel}
                        >
                          <option value="">{messages.speakerFilterAllLabel}</option>
                          {speakerOptions.map((option) => (
                            <option key={option.value} value={option.value}>{`${option.label} (${option.count})`}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {noteCategoryOptions.length > 0 ? (
                      <label className="app-side-pane-segment-list-filter-field">
                        <span className="app-side-pane-segment-list-filter-label">{messages.segmentListNoteCategoryFilterLabel}</span>
                        <select
                          className="app-side-pane-segment-list-filter-select"
                          value={noteCategoryFilter}
                          onChange={(e) => setNoteCategoryFilter(e.target.value)}
                          aria-label={messages.segmentListNoteCategoryFilterLabel}
                        >
                          <option value="">{messages.speakerFilterAllLabel}</option>
                          {noteCategoryOptions.map((option) => (
                            <option key={option.value} value={option.value}>{`${option.label} (${option.count})`}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {certaintyOptions.length > 0 ? (
                      <label className="app-side-pane-segment-list-filter-field">
                        <span className="app-side-pane-segment-list-filter-label">{messages.segmentListCertaintyFilterLabel}</span>
                        <select
                          className="app-side-pane-segment-list-filter-select"
                          value={certaintyFilter}
                          onChange={(e) => setCertaintyFilter(e.target.value as '' | UnitSelfCertainty)}
                          aria-label={messages.segmentListCertaintyFilterLabel}
                        >
                          <option value="">{messages.speakerFilterAllLabel}</option>
                          {certaintyOptions.map((option) => (
                            <option key={option.value} value={option.value}>{`${option.label} (${option.count})`}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {hasActiveFilters ? (
            <button
              type="button"
              className="app-side-pane-segment-list-filter-reset"
              onClick={() => {
                setFilterText('');
                setContentStateFilter('');
                setSpeakerFilter('');
                setNoteCategoryFilter('');
                setCertaintyFilter('');
                setAnnotationStatusFilter('');
                setSourceTypeFilter('');
              }}
            >
              {messages.segmentListFilterReset}
            </button>
          ) : null}
        </div>
      </div>
      <div className="app-side-pane-segment-list-scroll">
        {filtered.length === 0 ? (
          <div className="app-side-pane-segment-list-empty">
            {segmentListLoading || segmentMetaLoading
              ? messages.segmentListLoading
              : items.length === 0
                ? messages.segmentListNoSegments
                : messages.segmentListNoMatches}
          </div>
        ) : (
          <ul className="app-side-pane-segment-list">
            {filtered.map((item) => (
              <li key={item.key} className={`app-side-pane-segment-list-item${item.empty ? ' app-side-pane-segment-list-item-empty' : ''}`}>
                <button
                  type="button"
                  className="app-side-pane-segment-list-item-btn"
                  onClick={() => onSelectTimelineUnit?.(item.unit)}
                >
                  <span className="app-side-pane-segment-list-item-time">
                    {messages.segmentListTimeRange(formatTime(item.startTime), formatTime(item.endTime))}
                  </span>
                  {item.empty
                    ? <span className="app-side-pane-segment-list-item-text app-side-pane-segment-list-item-text-empty">{messages.segmentListEmpty}</span>
                    : <span className="app-side-pane-segment-list-item-text">{item.text}</span>}
                  {(item.speakerLabels.length > 0 || item.noteCategories.length > 0 || item.certainty || item.annotationStatus || item.sourceType) ? (
                    <span className="app-side-pane-segment-list-item-meta">
                      {item.speakerLabels.map((label) => (
                        <span key={`${item.key}-speaker-${label}`} className="app-side-pane-segment-list-chip">{label}</span>
                      ))}
                      {item.certainty ? (
                        <span className="app-side-pane-segment-list-chip app-side-pane-segment-list-chip-certainty">
                          {getSegmentCertaintyLabel(item.certainty, messages)}
                        </span>
                      ) : null}
                      {item.annotationStatus ? (
                        <span className="app-side-pane-segment-list-chip">
                          {getSegmentAnnotationStatusLabel(item.annotationStatus, messages)}
                        </span>
                      ) : null}
                      {item.sourceType ? (
                        <span className="app-side-pane-segment-list-chip">
                          {getSegmentSourceTypeLabel(item.sourceType, messages)}
                        </span>
                      ) : null}
                      {item.noteCategories.map((category) => (
                        <span key={`${item.key}-note-${category}`} className="app-side-pane-segment-list-chip app-side-pane-segment-list-chip-note">
                          {getSegmentNoteCategoryLabel(category, messages)}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
