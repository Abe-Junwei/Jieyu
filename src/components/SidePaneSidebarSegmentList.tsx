/**
 * 选中层的语段列表 | Segment list for the focused layer
 */
import { liveQuery } from 'dexie';
import { useEffect, useMemo, useState } from 'react';
import type {
  LayerDocType,
  LayerSegmentDocType,
  NoteCategory,
  SegmentMetaDocType,
  SpeakerDocType,
  UtteranceDocType,
} from '../db';
import { createTimelineUnit, type TimelineUnit } from '../hooks/transcriptionTypes';
import { resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { formatTime } from '../utils/transcriptionFormatters';
import { type UtteranceSelfCertainty } from '../utils/utteranceSelfCertainty';
import {
  CERTAINTY_ORDER as SEGMENT_CERTAINTY_ORDER,
  NOTE_CATEGORY_ORDER as SEGMENT_NOTE_CATEGORY_ORDER,
  getCertaintyLabel as getSegmentCertaintyLabel,
  getNoteCategoryLabel as getSegmentNoteCategoryLabel,
  resolveSpeakerLabel as resolveSegmentSpeakerLabel,
} from './sidePaneSegmentListViewModel';
import { SegmentMetaService } from '../services/SegmentMetaService';

interface SidePaneSidebarSegmentListProps {
  focusedLayerRowId: string;
  messages: SidePaneSidebarMessages;
  layers?: LayerDocType[];
  defaultTranscriptionLayerId?: string;
  segmentsByLayer?: ReadonlyMap<string, LayerSegmentDocType[]>;
  utterancesOnCurrentMedia?: UtteranceDocType[];
  speakers?: SpeakerDocType[];
  onSelectTimelineUnit?: (unit: TimelineUnit) => void;
}

type SegmentListItem = {
  key: string;
  unit: TimelineUnit;
  startTime: number;
  endTime: number;
  text: string;
  empty: boolean;
  speakerKeys: string[];
  speakerLabels: string[];
  noteCategories: NoteCategory[];
  certainty?: UtteranceSelfCertainty;
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
    utterancesOnCurrentMedia = [],
    speakers = [],
    onSelectTimelineUnit,
  } = props;

  const [filterText, setFilterText] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState('');
  const [noteCategoryFilter, setNoteCategoryFilter] = useState('');
  const [certaintyFilter, setCertaintyFilter] = useState<'' | UtteranceSelfCertainty>('');
  const [segmentMetaRows, setSegmentMetaRows] = useState<SegmentMetaDocType[]>([]);

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
    const utteranceMediaId = utterancesOnCurrentMedia.find((utterance) => (utterance.mediaId?.trim() ?? '').length > 0)?.mediaId?.trim();
    if (utteranceMediaId) return utteranceMediaId;

    const sourceLayerId = sourceLayer?.id ?? focusedLayer?.id;
    if (!sourceLayerId) return '';
    return segmentsByLayer?.get(sourceLayerId)?.find((segment) => segment.mediaId.trim().length > 0)?.mediaId?.trim() ?? '';
  }, [focusedLayer, segmentsByLayer, sourceLayer, utterancesOnCurrentMedia]);

  useEffect(() => {
    const layerId = focusedLayerRowId.trim();
    const mediaId = activeMediaId.trim();
    if (!layerId || !mediaId) {
      setSegmentMetaRows([]);
      return () => undefined;
    }

    let cancelled = false;
    const subscription = liveQuery(() => SegmentMetaService.listByLayerMedia(layerId, mediaId)).subscribe({
      next: (rows) => {
        if (cancelled) return;
        setSegmentMetaRows(rows);
      },
      error: () => {
        if (!cancelled) setSegmentMetaRows([]);
      },
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [activeMediaId, focusedLayerRowId]);

  const items = useMemo<SegmentListItem[]>(() => segmentMetaRows.map((row) => {
    const text = row.text.trim();
    const speakerKey = row.effectiveSpeakerId?.trim() ?? '';
    const fallbackSpeakerLabel = speakerKey ? resolveSegmentSpeakerLabel(speakerKey, speakerById) : '';
    const speakerLabel = row.effectiveSpeakerName?.trim() || fallbackSpeakerLabel;
    const speakerKeys = speakerKey ? [speakerKey] : [];
    const speakerLabels = speakerLabel ? [speakerLabel] : [];
    const noteCategories = row.noteCategoryKeys ?? [];
    const certainty = row.effectiveSelfCertainty;
    const timelineLayerId = row.unitKind === 'segment'
      ? (sourceLayer?.id ?? row.layerId)
      : row.layerId;
    const empty = !row.hasText;
    const searchIndex = [
      text,
      empty ? messages.segmentListEmpty : '',
      formatTime(row.startTime),
      formatTime(row.endTime),
      ...speakerLabels,
      ...noteCategories.map((category) => getSegmentNoteCategoryLabel(category, messages)),
      ...(certainty ? [getSegmentCertaintyLabel(certainty, messages)] : []),
    ].join(' ').toLowerCase();

    return {
      key: row.id,
      unit: createTimelineUnit(timelineLayerId, row.segmentId, row.unitKind ?? 'segment'),
      startTime: row.startTime,
      endTime: row.endTime,
      text,
      empty,
      speakerKeys,
      speakerLabels,
      noteCategories,
      ...(certainty ? { certainty } : {}),
      searchIndex,
    };
  }), [messages, segmentMetaRows, sourceLayer, speakerById]);

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

  const filtered = useMemo(() => {
    const keyword = filterText.trim().toLowerCase();
    return items.filter((item) => {
      if (keyword && !item.searchIndex.includes(keyword)) return false;
      if (speakerFilter && !item.speakerKeys.includes(speakerFilter)) return false;
      if (noteCategoryFilter && !item.noteCategories.includes(noteCategoryFilter as NoteCategory)) return false;
      if (certaintyFilter && item.certainty !== certaintyFilter) return false;
      return true;
    });
  }, [certaintyFilter, filterText, items, noteCategoryFilter, speakerFilter]);

  const hasActiveFilters = filterText.trim().length > 0 || speakerFilter || noteCategoryFilter || certaintyFilter;

  return (
    <section className="app-side-pane-group app-side-pane-segment-list-group" aria-label={messages.segmentListAria}>
      <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
        <span className="app-side-pane-section-title">{messages.segmentListTitle}</span>
      </div>
      <div className="app-side-pane-segment-list-filter">
        <input
          type="text"
          className="app-side-pane-segment-list-filter-input"
          placeholder={messages.segmentListFilterPlaceholder}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          aria-label={messages.segmentListFilterPlaceholder}
        />
        {(speakerOptions.length > 0 || noteCategoryOptions.length > 0 || certaintyOptions.length > 0) ? (
          <div className="app-side-pane-segment-list-filter-grid">
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
                  onChange={(e) => setCertaintyFilter(e.target.value as '' | UtteranceSelfCertainty)}
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
        ) : null}
        {hasActiveFilters ? (
          <button
            type="button"
            className="app-side-pane-segment-list-filter-reset"
            onClick={() => {
              setFilterText('');
              setSpeakerFilter('');
              setNoteCategoryFilter('');
              setCertaintyFilter('');
            }}
          >
            {messages.segmentListFilterReset}
          </button>
        ) : null}
      </div>
      <div className="app-side-pane-segment-list-scroll">
        {filtered.length === 0 ? (
          <div className="app-side-pane-segment-list-empty">
            {items.length === 0 ? messages.segmentListNoSegments : messages.segmentListNoMatches}
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
                  {(item.speakerLabels.length > 0 || item.noteCategories.length > 0 || item.certainty) ? (
                    <span className="app-side-pane-segment-list-item-meta">
                      {item.speakerLabels.map((label) => (
                        <span key={`${item.key}-speaker-${label}`} className="app-side-pane-segment-list-chip">{label}</span>
                      ))}
                      {item.certainty ? (
                        <span className="app-side-pane-segment-list-chip app-side-pane-segment-list-chip-certainty">
                          {getSegmentCertaintyLabel(item.certainty, messages)}
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
