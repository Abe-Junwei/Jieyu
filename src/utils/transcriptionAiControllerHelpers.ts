import type { LayerUnitDocType } from '../db';

export const TOOL_DECISION_LOG_REFRESH_ERROR_PREFIX = '\u5237\u65b0 AI \u5de5\u5177\u5ba1\u8ba1\u65e5\u5fd7\u5931\u8d25\uff1a';

export function toSyntheticUnitDoc(unit: {
  id: string;
  mediaId: string;
  textId?: string;
  startTime: number;
  endTime: number;
  speakerId?: string;
  tags?: Record<string, boolean>;
}): LayerUnitDocType {
  return {
    id: unit.id,
    mediaId: unit.mediaId,
    textId: unit.textId ?? '',
    startTime: unit.startTime,
    endTime: unit.endTime,
    ...(unit.speakerId ? { speakerId: unit.speakerId } : {}),
    ...(unit.tags ? { tags: unit.tags } : {}),
    createdAt: '',
    updatedAt: '',
  };
}
