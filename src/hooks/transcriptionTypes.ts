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

/** 时间轴统一选择单元 | Unified timeline selection unit */
export type TimelineUnit = {
  layerId: string;
  unitId: string;
  kind: 'utterance' | 'segment';
};

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
