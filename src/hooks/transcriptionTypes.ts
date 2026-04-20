import type { StructuredErrorMeta } from '../utils/errorProtocol';

export type DbState =
  | { phase: 'loading' }
  | {
      phase: 'ready';
      dbName: string;
      /** Mirrors unit row count — kept in sync after edits via useTranscriptionData */
      unitCount: number;
      /** Unified timeline semantic unit count (unit + de-duplicated segment semantic ids). */
      unifiedUnitCount?: number;
      /** Mirrors translation layers only (`layerType === 'translation'`), synced with live `layers` */
      translationLayerCount: number;
      /** Mirrors `translations.length` (segmentation unit texts) */
      translationRecordCount: number;
    }
  | { phase: 'error'; message: string };

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string; errorMeta?: StructuredErrorMeta };

export type TimelineUnitKind = 'unit' | 'segment';

/** 时间轴统一选择单元 | Unified timeline selection unit */
export type TimelineUnit = {
  layerId: string;
  unitId: string;
  kind: TimelineUnitKind;
};

export type TimelineLayerFallbackInput = {
  selectedLayerId?: string | null | undefined;
  focusedLayerId?: string | null | undefined;
  selectedTimelineUnitLayerId?: string | null | undefined;
  defaultTranscriptionLayerId?: string | null | undefined;
  firstTranscriptionLayerId?: string | null | undefined;
};

export function resolveTimelineLayerIdFallback(input: TimelineLayerFallbackInput): string {
  const candidates = [
    input.selectedLayerId,
    input.focusedLayerId,
    input.selectedTimelineUnitLayerId,
    input.defaultTranscriptionLayerId,
    input.firstTranscriptionLayerId,
  ];
  for (const candidate of candidates) {
    const normalized = candidate?.trim() ?? '';
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return '';
}

export function createTimelineUnit(
  layerId: string,
  unitId: string,
  kind: TimelineUnitKind,
): TimelineUnit {
  return { layerId, unitId, kind };
}

export function isTimelineUnitKind<K extends TimelineUnitKind>(
  unit: TimelineUnit | null | undefined,
  kind: K,
): unit is TimelineUnit & { kind: K } {
  return unit?.kind === kind;
}

export function isUnitTimelineUnit(unit: TimelineUnit | null | undefined): unit is TimelineUnit & { kind: 'unit' } {
  return isTimelineUnitKind(unit, 'unit');
}

export function isSegmentTimelineUnit(unit: TimelineUnit | null | undefined): unit is TimelineUnit & { kind: 'segment' } {
  return isTimelineUnitKind(unit, 'segment');
}

import type { LayerConstraint } from '../db';

export type LayerCreateInput = {
  languageId: string;
  dialect?: string | undefined;
  vernacular?: string | undefined;
  orthographyId?: string | undefined;
  alias?: string | undefined;
  textId?: string | undefined;
  /** 边界约束类型 | Boundary constraint type */
  constraint?: LayerConstraint;
  /** 转写层树依赖父层 ID（仅 transcription 层树语义）| Parent transcription-layer id for transcription tree constraints */
  parentLayerId?: string | undefined;
  /** 译文宿主转写层集合（translation 使用）| Translation host transcription-layer ids */
  hostTranscriptionLayerIds?: string[] | undefined;
  /** 译文主宿主转写层 ID（translation 使用）| Preferred host transcription-layer id for translation */
  preferredHostTranscriptionLayerId?: string | undefined;
};

export type SnapGuide = {
  visible: boolean;
  left?: number;
  right?: number;
  nearSide?: 'left' | 'right' | 'both';
};
