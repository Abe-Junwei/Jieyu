import { useCallback } from 'react';
import { getTranscriptionAppService } from '../app/TranscriptionAppService';

type TextKeyed = { textId?: string };

export function useTranscriptionDataTextTimeMapping(input: {
  units: readonly TextKeyed[];
  layers: readonly TextKeyed[];
  loadSnapshot: () => Promise<void>;
}) {
  const { units, layers, loadSnapshot } = input;
  const transcriptionAppService = getTranscriptionAppService();

  const applyTextTimeMapping = useCallback(async (params: {
    textId?: string;
    offsetSec?: number;
    scale?: number;
    sourceMediaId?: string;
  }) => {
    const textId = params.textId?.trim() || units[0]?.textId || layers[0]?.textId || '';
    if (!textId) {
      throw new Error('\u5f53\u524d\u6ca1\u6709\u53ef\u66f4\u65b0\u7684\u6587\u672c\u9879\u76ee');
    }
    await transcriptionAppService.updateTextTimeMapping({
      textId,
      ...(params.offsetSec !== undefined ? { offsetSec: params.offsetSec } : {}),
      ...(params.scale !== undefined ? { scale: params.scale } : {}),
      ...(params.sourceMediaId?.trim() ? { sourceMediaId: params.sourceMediaId.trim() } : {}),
    });
    await loadSnapshot();
  }, [layers, loadSnapshot, transcriptionAppService, units]);

  const previewTextTimeMapping = useCallback((previewInput: {
    startTime: number;
    endTime: number;
    offsetSec?: number;
    scale?: number;
  }) => transcriptionAppService.previewTextTimeMapping(previewInput), [transcriptionAppService]);

  return { applyTextTimeMapping, previewTextTimeMapping };
}
