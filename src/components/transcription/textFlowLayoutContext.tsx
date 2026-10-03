import { createContext, useContext } from 'react';
import type { TextFlowBox } from '../../utils/timelineTextFlowLayout';
import { textFlowFrameKey } from '../../utils/timelineTextFlowLayout';

export const TextFlowLayoutContext = createContext<ReadonlyMap<string, TextFlowBox> | null>(null);

export function useTextFlowFrame(
  layerId: string,
  unitId: string,
): {
  active: boolean;
  frame?: TextFlowBox;
} {
  const frames = useContext(TextFlowLayoutContext);
  if (!frames) return { active: false };
  const frame = frames.get(textFlowFrameKey(layerId, unitId));
  return frame ? { active: true, frame } : { active: true };
}
