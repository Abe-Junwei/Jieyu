import type { StructuredErrorMeta } from '../utils/errorProtocol';

export type DbState =
  | { phase: 'loading' }
  | {
      phase: 'ready';
      dbName: string;
      /** Mirrors unified timeline unit count — kept in sync after edits via useTranscriptionData */
      unitCount: number;
      /** Mirrors translation layers only (`layerType === 'translation'`), synced with live `layers` */
      translationLayerCount: number;
      /** Mirrors `translations.length` (segmentation utterance texts) */
      translationRecordCount: number;
    }
  | { phase: 'error'; message: string };

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string; errorMeta?: StructuredErrorMeta };

export type TimelineUnitKind = 'utterance' | 'segment';

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

export function isTimelineUnitKind(
  unit: TimelineUnit | null | undefined,
  kind: TimelineUnitKind,
): unit is TimelineUnit {
  return unit?.kind === kind;
}

export function isUtteranceTimelineUnit(unit: TimelineUnit | null | undefined): unit is TimelineUnit {
  return isTimelineUnitKind(unit, 'utterance');
}

export function isSegmentTimelineUnit(unit: TimelineUnit | null | undefined): unit is TimelineUnit {
  return isTimelineUnitKind(unit, 'segment');
}

import type { LayerConstraint } from '../db';

export type LayerCreateInput = {
  languageId: string;
  orthographyId?: string | undefined;
  alias?: string | undefined;
  textId?: string | undefined;
  /** 边界约束类型 | Boundary constraint type */
  constraint?: LayerConstraint;
  /** 依赖父层 ID（依赖边界时可选，多个独立层时必填）| Parent layer id for dependent constraints */
  parentLayerId?: string | undefined;
};

export type SnapGuide = {
  visible: boolean;
  left?: number;
  right?: number;
  nearSide?: 'left' | 'right' | 'both';
};
