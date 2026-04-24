/**
 * 选中层的语段列表 | Segment list for the focused layer
 */
import { useVirtualizer } from '@tanstack/react-virtual';
import { liveQuery } from 'dexie';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayerDocType, LayerLinkDocType, LayerSegmentViewDocType, LayerUnitContentViewDocType, LayerUnitDocType, LayerUnitStatus, NoteCategory, SegmentMetaDocType, SpeakerDocType } from '../db';
import { createTimelineUnit, type TimelineUnit } from '../hooks/transcriptionTypes';
import { resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import type { SidePaneSidebarMessages } from '../i18n/messages';
import { formatTime } from '../utils/transcriptionFormatters';
import { type UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { resolveHostUnitStrictMedia } from '../utils/segmentHostResolution';
import { ANNOTATION_STATUS_ORDER as SEGMENT_ANNOTATION_STATUS_ORDER, CERTAINTY_ORDER as SEGMENT_CERTAINTY_ORDER, NOTE_CATEGORY_ORDER as SEGMENT_NOTE_CATEGORY_ORDER, SOURCE_TYPE_ORDER as SEGMENT_SOURCE_TYPE_ORDER, computeSegmentReviewIssueFlags, getAnnotationStatusLabel as getSegmentAnnotationStatusLabel, getCertaintyLabel as getSegmentCertaintyLabel, getContentStateLabel as getSegmentContentStateLabel, getNoteCategoryLabel as getSegmentNoteCategoryLabel, getReviewPresetLabel as getSegmentReviewPresetLabel, getSourceTypeLabel as getSegmentSourceTypeLabel, matchesReviewPreset, resolveSpeakerLabel as resolveSegmentSpeakerLabel, type SegmentContentStateFilter, type SegmentReviewIssueFlags, type SegmentReviewPreset } from './sidePaneSegmentListViewModel';
import { SegmentMetaService } from '../services/SegmentMetaService';

interface SidePaneSidebarSegmentListProps {
  focusedLayerRowId: string;
  messages: SidePaneSidebarMessages;
  layers?: LayerDocType[];
  layerLinks?: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>;
  defaultTranscriptionLayerId?: string;
  segmentsByLayer?: ReadonlyMap<string, LayerSegmentViewDocType[]>;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentViewDocType>>;
  unitsOnCurrentMedia?: LayerUnitDocType[];
  speakers?: SpeakerDocType[];
  getUnitTextForLayer?: (unit: LayerUnitDocType, layerId?: string) => string;
  onSelectTimelineUnit?: (unit: TimelineUnit) => void;
  showReviewPresets?: boolean;
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
  skipProcessing?: boolean;
  issueFlags?: SegmentReviewIssueFlags;
};

type FacetOption = {
  value: string;
  label: string;
  count: number;
};

type FacetCategoryKey = 'contentState' | 'annotationStatus' | 'sourceType' | 'speaker' | 'noteCategory' | 'certainty';

type ReviewPresetOption = {
  value: SegmentReviewPreset | 'all';
  label: string;
  count: number;
};

/** 长列表启用虚拟滚动；低于阈值时保持原生列表 | Virtualize only above threshold */
const SEGMENT_LIST_VIRTUAL_THRESHOLD = 48;
/** 与 CSS 两行正文 + meta 区大致匹配；`measureElement` 会校正 | Matches ~2-line clamp + meta; measureElement refines */
const SEGMENT_ROW_ESTIMATE_PX = 74;

export function SidePaneSidebarSegmentList(props: SidePaneSidebarSegmentListProps) {
  const {
    focusedLayerRowId,
    messages,
    layers = [],
    layerLinks = [],
    defaultTranscriptionLayerId,
    segmentsByLayer,
    segmentContentByLayer,
    unitsOnCurrentMedia,
    speakers = [],
    getUnitTextForLayer,
    onSelectTimelineUnit,
    showReviewPresets = true,
  } = props;

  const [filterText, setFilterText] = useState('');
  const [contentStateFilters, setContentStateFilters] = useState<SegmentContentStateFilter[]>([]);
  const [speakerFilters, setSpeakerFilters] = useState<string[]>([]);
  const [noteCategoryFilters, setNoteCategoryFilters] = useState<NoteCategory[]>([]);
  const [certaintyFilters, setCertaintyFilters] = useState<UnitSelfCertainty[]>([]);
  const [annotationStatusFilters, setAnnotationStatusFilters] = useState<LayerUnitStatus[]>([]);
  const [sourceTypeFilters, setSourceTypeFilters] = useState<SegmentSourceType[]>([]);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [activeFacetCategory, setActiveFacetCategory] = useState<FacetCategoryKey | ''>('');
  const [activeReviewPreset, setActiveReviewPreset] = useState<SegmentReviewPreset | 'all' | ''>('');
  const [reviewCursor, setReviewCursor] = useState(0);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const segmentScrollRef = useRef<HTMLDivElement | null>(null);
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
    () => (focusedLayer ? resolveSegmentTimelineSourceLayer(focusedLayer, layerById, defaultTranscriptionLayerId, layerLinks) : undefined),
    [defaultTranscriptionLayerId, focusedLayer, layerById, layerLinks],
  );

  const activeMediaId = useMemo(() => {
    const unitMediaId = mediaUnits.find((unit) => (unit.mediaId?.trim() ?? '').length > 0)?.mediaId?.trim();
    if (unitMediaId) return unitMediaId;

    const sourceLayerId = sourceLayer?.id ?? focusedLayer?.id;
    if (!sourceLayerId) return '';
    return segmentsByLayer?.get(sourceLayerId)?.find((segment) => (segment.mediaId?.trim() ?? '').length > 0)?.mediaId?.trim() ?? '';
  }, [focusedLayer, mediaUnits, segmentsByLayer, sourceLayer]);

  const sourceLayerId = sourceLayer?.id ?? focusedLayer?.id ?? '';
  const displayLayerId = focusedLayerRowId.trim();
  /**
   * 读模型仍可用源层 scope 来拿共享边界/文本，但展示与点击行为必须锚定当前聚焦 lane。
   * The read-model may still consult the source scope for shared boundaries/text, but display and
   * selection semantics must stay anchored to the currently focused lane.
   */
  const segmentMetaScopeLayerId = useMemo(
    () => (sourceLayer?.id ?? focusedLayerRowId).trim(),
    [focusedLayerRowId, sourceLayer?.id],
  );
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
    const layerId = segmentMetaScopeLayerId;
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
  }, [activeMediaId, segmentMetaScopeLayerId]);

  useEffect(() => {
    const layerId = segmentMetaScopeLayerId;
    const mediaId = activeMediaId.trim();
    const hasRawItems = sourceSegments.length > 0
      || mediaUnits.some((unit) => (unit.mediaId?.trim() ?? '') === mediaId);
    if (!segmentMetaHydrated || segmentMetaLoading || !layerId || !mediaId || !hasRawItems || segmentMetaRows.length > 0) {
      return () => undefined;
    }

    void SegmentMetaService.rebuildForLayerMedia(layerId, mediaId).catch(() => undefined);
    return () => undefined;
  }, [activeMediaId, mediaUnits, segmentMetaHydrated, segmentMetaLoading, segmentMetaRows.length, segmentMetaScopeLayerId, sourceSegments.length]);

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

    /**
     * READ-ONLY 导航：尽力给 segment 找一个「可展示文本的宿主 unit」，
     * 仅用于在 SegmentMetaService 投影未就位时的 fallback 文本回退。
     *
     * ⚠️ 严禁用返回值去读 per-layer 字段（selfCertainty / status / provenance 等），
     *    否则会导致串层污染。per-layer 字段必须直接读 `segment.X` 本身。
     *    详见 self-certainty 串层 post-mortem。
     */
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

      // 时间包含/重叠回退：直接复用 utils/segmentHostResolution 里已集中维护的算法。
      // 该入口为 READ-ONLY（见文件头注释），不得用于 per-layer 字段写入。
      return resolveHostUnitStrictMedia(
        {
          startTime: segment.startTime,
          endTime: segment.endTime,
          ...(segment.mediaId !== undefined ? { mediaId: segment.mediaId } : {}),
        },
        mediaUnits,
      );
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
        // speakerId 是 unit-intrinsic 字段（跨层共享语义正确），可以向宿主回退。
        // speakerId is unit-intrinsic; falling back to the host unit is semantically correct.
        const speakerKey = segment.speakerId?.trim() || linkedUnit?.speakerId?.trim() || '';
        const speakerLabel = speakerKey ? resolveSegmentSpeakerLabel(speakerKey, speakerById) : '';
        // ⚠️ selfCertainty / status 是 per-layer 字段，禁止向宿主 unit 回退（串层污染根因）。
        //    只读 segment 自身的值；若该 segment row 是 unit-kind，segment.selfCertainty 就是其自身值。
        // ⚠️ selfCertainty / status are per-layer; NEVER fall back to the (shared) host unit.
        const sameDisplayLayer = (segment.layerId?.trim() ?? '') === displayLayerId;
        const certainty = sameDisplayLayer ? segment.selfCertainty : undefined;
        const annotationStatus = sameDisplayLayer ? segment.status : undefined;
        const empty = text.length === 0;
        const searchIndex = text.toLowerCase();

        return {
          key: `${focusedLayerRowId}::fallback::${segment.id}`,
          unit: createTimelineUnit(displayLayerId || sourceLayerId || focusedLayerRowId, segment.id, 'segment'),
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
          skipProcessing: linkedUnit?.tags?.skipProcessing === true,
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
          skipProcessing: unit.tags?.skipProcessing === true,
        };
      });
  }, [activeMediaId, displayLayerId, focusedLayerRowId, getUnitTextForLayer, mediaUnits, messages, segmentContentByLayer, sourceLayerId, sourceSegments, speakerById, unitById]);

  const rawItems = useMemo<SegmentListItem[]>(() => {
    const metaItems: SegmentListItem[] = segmentMetaRows.map((row): SegmentListItem => {
    const text = row.text.trim();
    const speakerKey = row.effectiveSpeakerId?.trim() ?? '';
    const fallbackSpeakerLabel = speakerKey ? resolveSegmentSpeakerLabel(speakerKey, speakerById) : '';
    const speakerLabel = row.effectiveSpeakerName?.trim() || fallbackSpeakerLabel;
    const speakerKeys = speakerKey ? [speakerKey] : [];
    const speakerLabels = speakerLabel ? [speakerLabel] : [];
    const rowMatchesFocusedLayer = row.unitKind !== 'segment'
      || (row.layerId?.trim() ?? '') === displayLayerId;
    const noteCategories = rowMatchesFocusedLayer ? (row.noteCategoryKeys ?? []) : [];
    const certainty = rowMatchesFocusedLayer ? row.effectiveSelfCertainty : undefined;
    const annotationStatus = rowMatchesFocusedLayer ? row.annotationStatus : undefined;
    const sourceType = rowMatchesFocusedLayer ? row.sourceType : undefined;
    const timelineLayerId = displayLayerId || row.layerId;
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
        skipProcessing: false,
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
      const mergedSkipProcessing = liveItem.skipProcessing === true || item.skipProcessing === true;

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
        skipProcessing: mergedSkipProcessing,
      });
    }

    return [...mergedByUnitKey.values()].sort((left, right) => {
      if (left.startTime !== right.startTime) return left.startTime - right.startTime;
      if (left.endTime !== right.endTime) return left.endTime - right.endTime;
      return left.key.localeCompare(right.key);
    });
  }, [displayLayerId, fallbackItems, messages, segmentMetaRows, speakerById]);

  const speakerConsistencyEnabled = useMemo(() => {
    if (focusedLayer?.layerType !== 'transcription') return false;
    const reviewableItems = rawItems.filter((item) => item.skipProcessing !== true);
    const assignedCount = reviewableItems.filter((item) => item.speakerKeys.length > 0).length;
    return reviewableItems.length > 0 && assignedCount > 0 && assignedCount < reviewableItems.length;
  }, [focusedLayer?.layerType, rawItems]);

  const items = useMemo<SegmentListItem[]>(() => rawItems.map((item, index, rows) => {
    const previousItem = rows[index - 1];
    const issueFlags = computeSegmentReviewIssueFlags({
      empty: item.empty,
      ...(item.certainty !== undefined ? { certainty: item.certainty } : {}),
      noteCategories: item.noteCategories,
      ...(item.annotationStatus !== undefined ? { annotationStatus: item.annotationStatus } : {}),
      speakerKeys: item.speakerKeys,
      startTime: item.startTime,
      endTime: item.endTime,
      ...(item.skipProcessing === true ? { skipProcessing: true } : {}),
    }, {
      isTranscriptionLayer: focusedLayer?.layerType === 'transcription',
      allowSpeakerPending: speakerConsistencyEnabled,
      ...(previousItem !== undefined ? { previousEndTime: previousItem.endTime } : {}),
    });

    return {
      ...item,
      issueFlags,
    };
  }), [focusedLayer?.layerType, rawItems, speakerConsistencyEnabled]);

  const reviewPresetOptions = useMemo<ReviewPresetOption[]>(() => {
    const total = items.filter((item) => Object.values(item.issueFlags ?? {}).some(Boolean)).length;
    if (total <= 0) return [];

    const timeCount = items.filter((item) => item.issueFlags?.time).length;
    const contentConcernCount = items.filter((item) => item.issueFlags?.contentConcern).length;
    const contentMissingCount = items.filter((item) => matchesReviewPreset(item.issueFlags ?? {
      time: false,
      contentConcern: false,
      contentMissing: false,
      manualAttention: false,
      pendingReview: false,
      speakerPending: false,
    }, 'content_missing')).length;
    const manualAttentionCount = items.filter((item) => item.issueFlags?.manualAttention).length;
    const pendingReviewCount = items.filter((item) => item.issueFlags?.pendingReview).length;

    return [
      { value: 'all', label: getSegmentReviewPresetLabel('all', messages), count: total },
      { value: 'time', label: getSegmentReviewPresetLabel('time', messages), count: timeCount },
      { value: 'content_concern', label: getSegmentReviewPresetLabel('content_concern', messages), count: contentConcernCount },
      { value: 'content_missing', label: getSegmentReviewPresetLabel('content_missing', messages), count: contentMissingCount },
      { value: 'manual_attention', label: getSegmentReviewPresetLabel('manual_attention', messages), count: manualAttentionCount },
      { value: 'pending_review', label: getSegmentReviewPresetLabel('pending_review', messages), count: pendingReviewCount },
    ];
  }, [items, messages]);

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

  const pruneSelectedValues = <T extends string>(prev: T[], validValues: Set<T>): T[] => {
    const next = prev.filter((value) => validValues.has(value));
    if (next.length === prev.length && next.every((value, index) => value === prev[index])) {
      return prev;
    }
    return next;
  };

  useEffect(() => {
    const validValues = new Set(contentStateOptions.map((option) => option.value as SegmentContentStateFilter));
    setContentStateFilters((prev) => pruneSelectedValues(prev, validValues));
  }, [contentStateOptions]);

  useEffect(() => {
    const validValues = new Set(speakerOptions.map((option) => option.value));
    setSpeakerFilters((prev) => pruneSelectedValues(prev, validValues));
  }, [speakerOptions]);

  useEffect(() => {
    const validValues = new Set(noteCategoryOptions.map((option) => option.value as NoteCategory));
    setNoteCategoryFilters((prev) => pruneSelectedValues(prev, validValues));
  }, [noteCategoryOptions]);

  useEffect(() => {
    const validValues = new Set(certaintyOptions.map((option) => option.value as UnitSelfCertainty));
    setCertaintyFilters((prev) => pruneSelectedValues(prev, validValues));
  }, [certaintyOptions]);

  useEffect(() => {
    const validValues = new Set(annotationStatusOptions.map((option) => option.value as LayerUnitStatus));
    setAnnotationStatusFilters((prev) => pruneSelectedValues(prev, validValues));
  }, [annotationStatusOptions]);

  useEffect(() => {
    const validValues = new Set(sourceTypeOptions.map((option) => option.value as SegmentSourceType));
    setSourceTypeFilters((prev) => pruneSelectedValues(prev, validValues));
  }, [sourceTypeOptions]);

  const toggleFacetValue = <T extends string>(setter: (updater: (prev: T[]) => T[]) => void, value: T) => {
    setter((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const facetCategories = useMemo(() => ([
    {
      key: 'contentState' as const,
      label: messages.segmentListContentFilterLabel,
      options: contentStateOptions,
      selectedValues: contentStateFilters,
    },
    {
      key: 'annotationStatus' as const,
      label: messages.segmentListAnnotationStatusFilterLabel,
      options: annotationStatusOptions,
      selectedValues: annotationStatusFilters,
    },
    {
      key: 'sourceType' as const,
      label: messages.segmentListSourceTypeFilterLabel,
      options: sourceTypeOptions,
      selectedValues: sourceTypeFilters,
    },
    {
      key: 'speaker' as const,
      label: messages.segmentListSpeakerFilterLabel,
      options: speakerOptions,
      selectedValues: speakerFilters,
    },
    {
      key: 'noteCategory' as const,
      label: messages.segmentListNoteCategoryFilterLabel,
      options: noteCategoryOptions,
      selectedValues: noteCategoryFilters,
    },
    {
      key: 'certainty' as const,
      label: messages.segmentListCertaintyFilterLabel,
      options: certaintyOptions,
      selectedValues: certaintyFilters,
    },
  ]), [
    annotationStatusFilters,
    annotationStatusOptions,
    certaintyFilters,
    certaintyOptions,
    contentStateFilters,
    contentStateOptions,
    messages.segmentListAnnotationStatusFilterLabel,
    messages.segmentListCertaintyFilterLabel,
    messages.segmentListContentFilterLabel,
    messages.segmentListNoteCategoryFilterLabel,
    messages.segmentListSourceTypeFilterLabel,
    messages.segmentListSpeakerFilterLabel,
    noteCategoryFilters,
    noteCategoryOptions,
    sourceTypeFilters,
    sourceTypeOptions,
    speakerFilters,
    speakerOptions,
  ]);

  const availableFacetCategories = useMemo(
    () => facetCategories.filter((category) => category.options.length > 0),
    [facetCategories],
  );

  useEffect(() => {
    if (availableFacetCategories.length === 0) {
      if (activeFacetCategory) setActiveFacetCategory('');
      return;
    }
    if (!availableFacetCategories.some((category) => category.key === activeFacetCategory)) {
      const firstCategory = availableFacetCategories[0];
      if (firstCategory) {
        setActiveFacetCategory(firstCategory.key);
      }
    }
  }, [activeFacetCategory, availableFacetCategories]);

  const toggleFacetOption = (categoryKey: FacetCategoryKey, value: string) => {
    switch (categoryKey) {
      case 'contentState':
        toggleFacetValue<SegmentContentStateFilter>(setContentStateFilters, value as SegmentContentStateFilter);
        return;
      case 'annotationStatus':
        toggleFacetValue<LayerUnitStatus>(setAnnotationStatusFilters, value as LayerUnitStatus);
        return;
      case 'sourceType':
        toggleFacetValue<SegmentSourceType>(setSourceTypeFilters, value as SegmentSourceType);
        return;
      case 'speaker':
        toggleFacetValue<string>(setSpeakerFilters, value);
        return;
      case 'noteCategory':
        toggleFacetValue<NoteCategory>(setNoteCategoryFilters, value as NoteCategory);
        return;
      case 'certainty':
        toggleFacetValue<UnitSelfCertainty>(setCertaintyFilters, value as UnitSelfCertainty);
        return;
      default:
        return;
    }
  };

  const activeFilterTags = useMemo(() => {
    const tags: Array<{ id: string; categoryKey: FacetCategoryKey; value: string; label: string }> = [];
    const optionLabel = (options: FacetOption[], value: string) => options.find((option) => option.value === value)?.label ?? value;

    for (const value of contentStateFilters) {
      tags.push({
        id: `contentState:${value}`,
        categoryKey: 'contentState',
        value,
        label: optionLabel(contentStateOptions, value),
      });
    }
    for (const value of annotationStatusFilters) {
      tags.push({
        id: `annotationStatus:${value}`,
        categoryKey: 'annotationStatus',
        value,
        label: optionLabel(annotationStatusOptions, value),
      });
    }
    for (const value of sourceTypeFilters) {
      tags.push({
        id: `sourceType:${value}`,
        categoryKey: 'sourceType',
        value,
        label: optionLabel(sourceTypeOptions, value),
      });
    }
    for (const value of speakerFilters) {
      tags.push({
        id: `speaker:${value}`,
        categoryKey: 'speaker',
        value,
        label: optionLabel(speakerOptions, value),
      });
    }
    for (const value of noteCategoryFilters) {
      tags.push({
        id: `noteCategory:${value}`,
        categoryKey: 'noteCategory',
        value,
        label: optionLabel(noteCategoryOptions, value),
      });
    }
    for (const value of certaintyFilters) {
      tags.push({
        id: `certainty:${value}`,
        categoryKey: 'certainty',
        value,
        label: optionLabel(certaintyOptions, value),
      });
    }

    return tags;
  }, [
    annotationStatusFilters,
    annotationStatusOptions,
    certaintyFilters,
    certaintyOptions,
    contentStateFilters,
    contentStateOptions,
    noteCategoryFilters,
    noteCategoryOptions,
    sourceTypeFilters,
    sourceTypeOptions,
    speakerFilters,
    speakerOptions,
  ]);

  const formatFacetCategoryMenuLabel = (label: string) => {
    const normalized = label.trim();
    if (normalized.startsWith('\u6309') && normalized.endsWith('\u7b5b\u9009')) {
      return normalized.slice(1, -2).trim();
    }
    if (/^filter by\s+/i.test(normalized)) {
      return normalized.replace(/^filter by\s+/i, '').trim();
    }
    return normalized;
  };

  const filtered = useMemo(() => {
    const keyword = filterText.trim().toLowerCase();
    return items.filter((item) => {
      if (activeReviewPreset && !matchesReviewPreset(item.issueFlags ?? {
        time: false,
        contentConcern: false,
        contentMissing: false,
        manualAttention: false,
        pendingReview: false,
        speakerPending: false,
      }, activeReviewPreset)) {
        return false;
      }
      if (keyword && !item.searchIndex.includes(keyword)) return false;
      if (contentStateFilters.length > 0) {
        const matchedContentState = contentStateFilters.some((filter) => (filter === 'has_text' ? item.hasText : !item.hasText));
        if (!matchedContentState) return false;
      }
      if (speakerFilters.length > 0 && !speakerFilters.some((filter) => item.speakerKeys.includes(filter))) return false;
      if (noteCategoryFilters.length > 0 && !noteCategoryFilters.some((filter) => item.noteCategories.includes(filter))) return false;
      if (certaintyFilters.length > 0 && !certaintyFilters.includes(item.certainty as UnitSelfCertainty)) return false;
      if (annotationStatusFilters.length > 0 && !annotationStatusFilters.includes(item.annotationStatus as LayerUnitStatus)) return false;
      if (sourceTypeFilters.length > 0 && !sourceTypeFilters.includes(item.sourceType as SegmentSourceType)) return false;
      return true;
    });
  }, [activeReviewPreset, annotationStatusFilters, certaintyFilters, contentStateFilters, filterText, items, noteCategoryFilters, sourceTypeFilters, speakerFilters]);

  const useSegmentVirtualization = filtered.length >= SEGMENT_LIST_VIRTUAL_THRESHOLD;

  const segmentVirtualizer = useVirtualizer({
    count: useSegmentVirtualization ? filtered.length : 0,
    getScrollElement: () => segmentScrollRef.current,
    estimateSize: () => SEGMENT_ROW_ESTIMATE_PX,
    overscan: 10,
    getItemKey: (index) => filtered[index]?.key ?? String(index),
  });

  const segmentVirtualizerRef = useRef(segmentVirtualizer);
  segmentVirtualizerRef.current = segmentVirtualizer;

  useEffect(() => {
    if (!useSegmentVirtualization || filtered.length === 0) return;
    segmentVirtualizerRef.current.scrollToIndex(reviewCursor, { align: 'auto' });
  }, [reviewCursor, filtered.length, useSegmentVirtualization]);

  useEffect(() => {
    setReviewCursor((prev) => {
      if (filtered.length === 0) return 0;
      return Math.min(prev, filtered.length - 1);
    });
  }, [filtered.length]);

  useEffect(() => {
    setReviewCursor(0);
  }, [activeReviewPreset]);

  const goToReviewItem = (direction: -1 | 1) => {
    if (filtered.length === 0) return;
    const nextIndex = (reviewCursor + direction + filtered.length) % filtered.length;
    setReviewCursor(nextIndex);
    const row = filtered[nextIndex];
    if (!row) return;
    onSelectTimelineUnit?.(row.unit);
  };

  const hasActiveFilters = activeReviewPreset !== ''
    || filterText.trim().length > 0
    || contentStateFilters.length > 0
    || speakerFilters.length > 0
    || noteCategoryFilters.length > 0
    || certaintyFilters.length > 0
    || annotationStatusFilters.length > 0
    || sourceTypeFilters.length > 0;
  const hasFacetFilters = contentStateOptions.length > 0
    || speakerOptions.length > 0
    || noteCategoryOptions.length > 0
    || certaintyOptions.length > 0
    || annotationStatusOptions.length > 0
    || sourceTypeOptions.length > 0;
  const activeFacetCount = contentStateFilters.length
    + speakerFilters.length
    + noteCategoryFilters.length
    + certaintyFilters.length
    + annotationStatusFilters.length
    + sourceTypeFilters.length;

  useEffect(() => {
    if (!isFilterMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (filterMenuRef.current?.contains(target)) return;
      setIsFilterMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFilterMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFilterMenuOpen]);

  useEffect(() => {
    if (!hasFacetFilters && isFilterMenuOpen) {
      setIsFilterMenuOpen(false);
    }
  }, [hasFacetFilters, isFilterMenuOpen]);

  return (
    <section className="app-side-pane-group app-side-pane-segment-list-group" aria-label={messages.segmentListAria}>
      <div className="app-side-pane-segment-list-filter">
        {showReviewPresets && reviewPresetOptions.length > 0 ? (
          <div className="app-side-pane-segment-list-review-presets" role="group" aria-label={messages.segmentListTitle}>
            {reviewPresetOptions.map((option) => {
              const selected = activeReviewPreset === option.value;
              return (
                <button
                  key={`review-preset:${option.value}`}
                  type="button"
                  className={`app-side-pane-segment-list-review-preset${selected ? ' is-active' : ''}`}
                  aria-pressed={selected}
                  disabled={option.count === 0}
                  onClick={() => {
                    if (option.count === 0) return;
                    setReviewCursor(0);
                    setActiveReviewPreset((prev) => (prev === option.value ? '' : option.value));
                  }}
                >
                  <span className="app-side-pane-segment-list-review-preset-label">{option.label}</span>
                  <span className="app-side-pane-segment-list-review-preset-count">{option.count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {showReviewPresets && activeReviewPreset && filtered.length > 0 ? (
          <div className="app-side-pane-segment-list-review-presets" role="group" aria-label={messages.segmentListReviewPresetPendingReview}>
            <button
              type="button"
              className="app-side-pane-segment-list-review-preset"
              aria-label={messages.segmentListReviewPrev}
              onClick={() => goToReviewItem(-1)}
            >
              ←
            </button>
            <span className="app-side-pane-segment-list-review-preset-count">{reviewCursor + 1}/{filtered.length}</span>
            <button
              type="button"
              className="app-side-pane-segment-list-review-preset"
              aria-label={messages.segmentListReviewNext}
              onClick={() => goToReviewItem(1)}
            >
              →
            </button>
          </div>
        ) : null}
        <div className="app-side-pane-segment-list-search-shell">
          <span className="app-side-pane-segment-list-search-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" className="app-side-pane-segment-list-search-icon-svg" focusable="false">
              <circle cx="8.5" cy="8.5" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 12l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <div className="app-side-pane-segment-list-search-content">
            {activeFilterTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="app-side-pane-segment-list-search-tag"
                title={tag.label}
                aria-label={tag.label}
                onClick={() => toggleFacetOption(tag.categoryKey, tag.value)}
              >
                <span className="app-side-pane-segment-list-search-tag-label">{tag.label}</span>
                <span className="app-side-pane-segment-list-search-tag-remove" aria-hidden="true">×</span>
              </button>
            ))}
            <input
              type="text"
              className="app-side-pane-segment-list-filter-input"
              placeholder={activeFilterTags.length === 0 ? messages.segmentListFilterPlaceholder : ''}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              aria-label={messages.segmentListFilterPlaceholder}
            />
          </div>
          {hasFacetFilters ? (
            <div ref={filterMenuRef} className={`app-side-pane-segment-list-filter-box${isFilterMenuOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className="app-side-pane-segment-list-filter-trigger"
                aria-expanded={isFilterMenuOpen}
                aria-haspopup="dialog"
                onClick={() => setIsFilterMenuOpen((value) => !value)}
              >
                <span className="app-side-pane-segment-list-filter-trigger-label">{messages.segmentListFilterButton}</span>
                {activeFacetCount > 0 ? (
                  <span className="app-side-pane-segment-list-filter-trigger-count">{activeFacetCount}</span>
                ) : null}
                <span className="app-side-pane-segment-list-filter-trigger-caret" aria-hidden="true">▾</span>
              </button>
              {isFilterMenuOpen ? (
                <div className="app-side-pane-segment-list-filter-panel" role="dialog" aria-label={messages.segmentListFilterButton}>
                  {availableFacetCategories.length > 0 ? (
                    <div className="app-side-pane-segment-list-filter-compact">
                      {availableFacetCategories.map((category) => {
                        const categoryMenuLabel = formatFacetCategoryMenuLabel(category.label);
                        return (
                          <div key={category.key} className="app-side-pane-segment-list-filter-row">
                            <button
                              type="button"
                              className={`app-side-pane-segment-list-filter-category-item${category.key === activeFacetCategory ? ' is-active' : ''}`}
                              aria-pressed={category.key === activeFacetCategory}
                              onClick={() => setActiveFacetCategory(category.key)}
                            >
                              <span className="app-side-pane-segment-list-filter-category-item-label">{categoryMenuLabel}</span>
                              {category.selectedValues.length > 0 ? (
                                <span className="app-side-pane-segment-list-filter-category-item-count">{category.selectedValues.length}</span>
                              ) : null}
                            </button>
                            <div className="app-side-pane-segment-list-filter-option-list" role="menu" aria-label={categoryMenuLabel}>
                              {category.options.map((option) => {
                                const selected = (category.selectedValues as string[]).includes(option.value);
                                return (
                                  <button
                                    key={`${category.key}:${option.value}`}
                                    type="button"
                                    className={`app-side-pane-segment-list-filter-option${selected ? ' is-active' : ''}`}
                                    aria-pressed={selected}
                                    onClick={() => toggleFacetOption(category.key, option.value)}
                                  >
                                    <span className="app-side-pane-segment-list-filter-option-marker" aria-hidden="true">{selected ? '✓' : ''}</span>
                                    <span className="app-side-pane-segment-list-filter-option-label">{option.label}</span>
                                    <span className="app-side-pane-segment-list-filter-option-count">{option.count}</span>
                                  </button>
                                );
                              })}
                              {category.options.length === 0 ? (
                                <p className="app-side-pane-segment-list-filter-panel-empty">{messages.segmentListFilterNoOptions}</p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="app-side-pane-segment-list-filter-panel-empty">{messages.segmentListFilterNoOptions}</p>
                  )}
                  <div className="app-side-pane-segment-list-filter-actions">
                    {hasActiveFilters ? (
                      <button
                        type="button"
                        className="app-side-pane-segment-list-filter-reset"
                        onClick={() => {
                          setActiveReviewPreset('');
                          setFilterText('');
                          setContentStateFilters([]);
                          setSpeakerFilters([]);
                          setNoteCategoryFilters([]);
                          setCertaintyFilters([]);
                          setAnnotationStatusFilters([]);
                          setSourceTypeFilters([]);
                          setIsFilterMenuOpen(false);
                        }}
                      >
                        {messages.segmentListFilterReset}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div ref={segmentScrollRef} className="app-side-pane-segment-list-scroll">
        {filtered.length === 0 ? (
          <div className="app-side-pane-segment-list-empty">
            {segmentListLoading || segmentMetaLoading
              ? messages.segmentListLoading
              : items.length === 0
                ? messages.segmentListNoSegments
                : messages.segmentListNoMatches}
          </div>
        ) : useSegmentVirtualization ? (
          <ul
            className="app-side-pane-segment-list app-side-pane-segment-list--virtual"
            style={{
              height: `${segmentVirtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {segmentVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = filtered[virtualRow.index];
              if (!item) return null;
              const index = virtualRow.index;
              return (
                <li
                  key={item.key}
                  data-index={virtualRow.index}
                  ref={segmentVirtualizer.measureElement}
                  className={`app-side-pane-segment-list-item${item.empty ? ' app-side-pane-segment-list-item-empty' : ''}${index === reviewCursor && activeReviewPreset ? ' is-active-review-target' : ''}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <button
                    type="button"
                    className="app-side-pane-segment-list-item-btn"
                    onClick={() => {
                      setReviewCursor(index);
                      onSelectTimelineUnit?.(item.unit);
                    }}
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
                        {item.issueFlags?.speakerPending ? (
                          <span className="app-side-pane-segment-list-chip app-side-pane-segment-list-chip-note">
                            {messages.segmentListSpeakerPending}
                          </span>
                        ) : null}
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
              );
            })}
          </ul>
        ) : (
          <ul className="app-side-pane-segment-list">
            {filtered.map((item, index) => (
              <li key={item.key} className={`app-side-pane-segment-list-item${item.empty ? ' app-side-pane-segment-list-item-empty' : ''}${index === reviewCursor && activeReviewPreset ? ' is-active-review-target' : ''}`}>
                <button
                  type="button"
                  className="app-side-pane-segment-list-item-btn"
                  onClick={() => {
                    setReviewCursor(index);
                    onSelectTimelineUnit?.(item.unit);
                  }}
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
                      {item.issueFlags?.speakerPending ? (
                        <span className="app-side-pane-segment-list-chip app-side-pane-segment-list-chip-note">
                          {messages.segmentListSpeakerPending}
                        </span>
                      ) : null}
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
