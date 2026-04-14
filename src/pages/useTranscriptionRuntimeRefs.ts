import { useEffect, useRef } from 'react';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';
import { INITIAL_OVERLAP_CYCLE_TELEMETRY } from '../utils/overlapCycleTelemetry';
import { useTranscriptionWorkspaceTopCssVar } from './useTranscriptionWorkspaceTopCssVar';

interface UseTranscriptionRuntimeRefsInput {
  cssVarEnabled: boolean;
}

export function useTranscriptionRuntimeRefs({
  cssVarEnabled,
}: UseTranscriptionRuntimeRefsInput) {
  const executeActionRef = useRef<((actionId: string) => void) | undefined>(undefined);
  const openSearchRef = useRef<((detail?: AppShellOpenSearchDetail) => void) | undefined>(undefined);
  const seekToTimeRef = useRef<((timeSeconds: number) => void) | undefined>(undefined);
  const splitAtTimeRef = useRef<((timeSeconds: number) => boolean) | undefined>(undefined);
  const zoomToSegmentRef = useRef<((segmentId: string, zoomLevel?: number) => boolean) | undefined>(undefined);

  const utteranceRowRef = useRef<Record<string, HTMLDivElement | null>>({});
  const overlapCycleTelemetryRef = useRef(INITIAL_OVERLAP_CYCLE_TELEMETRY);
  const manualSelectTsRef = useRef(0);

  const tierContainerRef = useRef<HTMLDivElement>(null);
  const listMainRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const screenRef = useRef<HTMLElement | null>(null);
  const waveformSectionRef = useRef<HTMLElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { dragCleanupRef.current?.(); }, []);

  useTranscriptionWorkspaceTopCssVar({
    enabled: cssVarEnabled,
    screenRef,
    waveformSectionRef,
  });

  return {
    executeActionRef,
    openSearchRef,
    seekToTimeRef,
    splitAtTimeRef,
    zoomToSegmentRef,
    utteranceRowRef,
    overlapCycleTelemetryRef,
    manualSelectTsRef,
    tierContainerRef,
    listMainRef,
    workspaceRef,
    screenRef,
    waveformSectionRef,
    dragCleanupRef,
  };
}
