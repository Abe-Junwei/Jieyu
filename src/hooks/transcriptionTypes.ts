import type { StructuredErrorMeta } from '../utils/errorProtocol';

export type DbState =
  | { phase: 'loading' }
  | {
      phase: 'ready';
      dbName: string;
      utteranceCount: number;
      translationLayerCount: number;
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
  alias?: string | undefined;
  textId?: string | undefined;
  /** 边界约束类型 | Boundary constraint type */
  constraint?: LayerConstraint;
};

export type SnapGuide = {
  visible: boolean;
  left?: number;
  right?: number;
  nearSide?: 'left' | 'right' | 'both';
};
