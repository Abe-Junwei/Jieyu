import { useLayoutEffect } from 'react';
import type { MutableRefObject } from 'react';

import { useReadyWorkspaceWaveformBridgeController } from './useReadyWorkspaceWaveformBridgeController';

type WaveformBridgeInput = Parameters<typeof useReadyWorkspaceWaveformBridgeController>[0];

export interface UseReadyWorkspaceWaveformBridgePhaseParams extends WaveformBridgeInput {
  documentSpanSecFromBridgeRef: MutableRefObject<number>;
}

/** L7：波形桥 + 将桥产出的 `documentSpanSec` 同步到 ref（供段钳制 / playback 等读快照） */
export function useReadyWorkspaceWaveformBridgePhase(
  params: UseReadyWorkspaceWaveformBridgePhaseParams,
) {
  const { documentSpanSecFromBridgeRef, ...bridgeInput } = params;
  const bridge = useReadyWorkspaceWaveformBridgeController({
    ...bridgeInput,
  });

  useLayoutEffect(() => {
    documentSpanSecFromBridgeRef.current = bridge.documentSpanSec;
  }, [bridge.documentSpanSec, documentSpanSecFromBridgeRef]);

  return bridge;
}
