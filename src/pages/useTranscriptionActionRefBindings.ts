import { useEffect, type MutableRefObject } from 'react';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';
import type { WaveformInteractionHandlerRefs } from './useTranscriptionWaveformBridgeController';

type OpenSearchHandler = ((detail?: AppShellOpenSearchDetail) => void) | undefined;
type SeekToTimeHandler = ((timeSeconds: number) => void) | undefined;
type ExecuteActionHandler = ((actionId: string) => void) | undefined;
type SplitAtTimeHandler = ((timeSeconds: number) => boolean) | undefined;
type ZoomToSegmentHandler = ((segmentId: string, zoomLevel?: number) => boolean) | undefined;

type WaveformRegionAltPointerDownHandler = NonNullable<WaveformInteractionHandlerRefs['handleWaveformRegionAltPointerDownRef']['current']>;
type WaveformRegionClickHandler = NonNullable<WaveformInteractionHandlerRefs['handleWaveformRegionClickRef']['current']>;
type WaveformRegionDoubleClickHandler = NonNullable<WaveformInteractionHandlerRefs['handleWaveformRegionDoubleClickRef']['current']>;
type WaveformRegionCreateHandler = NonNullable<WaveformInteractionHandlerRefs['handleWaveformRegionCreateRef']['current']>;
type WaveformRegionContextMenuHandler = NonNullable<WaveformInteractionHandlerRefs['handleWaveformRegionContextMenuRef']['current']>;
type WaveformRegionUpdateHandler = NonNullable<WaveformInteractionHandlerRefs['handleWaveformRegionUpdateRef']['current']>;
type WaveformTimeUpdateHandler = NonNullable<WaveformInteractionHandlerRefs['handleWaveformTimeUpdateRef']['current']>;

interface UseTranscriptionActionRefBindingsInput {
  executeActionRef: MutableRefObject<ExecuteActionHandler>;
  executeAction: NonNullable<ExecuteActionHandler>;
  openSearchRef: MutableRefObject<OpenSearchHandler>;
  openSearchFromRequest: NonNullable<OpenSearchHandler>;
  seekToTimeRef: MutableRefObject<SeekToTimeHandler>;
  seekToTime: NonNullable<SeekToTimeHandler>;
  splitAtTimeRef: MutableRefObject<SplitAtTimeHandler>;
  handleSplitAtTimeRequest: NonNullable<SplitAtTimeHandler>;
  zoomToSegmentRef: MutableRefObject<ZoomToSegmentHandler>;
  handleZoomToSegmentRequest: NonNullable<ZoomToSegmentHandler>;
  waveformInteractionHandlerRefs: WaveformInteractionHandlerRefs;
  handleWaveformRegionAltPointerDown: WaveformRegionAltPointerDownHandler;
  handleWaveformRegionClick: WaveformRegionClickHandler;
  handleWaveformRegionDoubleClick: WaveformRegionDoubleClickHandler;
  handleWaveformRegionCreate: WaveformRegionCreateHandler;
  handleWaveformRegionContextMenu: WaveformRegionContextMenuHandler;
  handleWaveformRegionUpdate: WaveformRegionUpdateHandler;
  handleWaveformRegionUpdateEnd: WaveformRegionUpdateHandler;
  handleWaveformTimeUpdate: WaveformTimeUpdateHandler;
}

export function useTranscriptionActionRefBindings(input: UseTranscriptionActionRefBindingsInput): void {
  useEffect(() => {
    input.openSearchRef.current = input.openSearchFromRequest;

    return () => {
      input.openSearchRef.current = undefined;
    };
  }, [input.openSearchFromRequest, input.openSearchRef]);

  useEffect(() => {
    input.seekToTimeRef.current = input.seekToTime;

    return () => {
      input.seekToTimeRef.current = undefined;
    };
  }, [input.seekToTime, input.seekToTimeRef]);

  useEffect(() => {
    input.executeActionRef.current = input.executeAction;

    return () => {
      input.executeActionRef.current = undefined;
    };
  }, [input.executeAction, input.executeActionRef]);

  useEffect(() => {
    input.waveformInteractionHandlerRefs.handleWaveformRegionAltPointerDownRef.current = input.handleWaveformRegionAltPointerDown;
    input.waveformInteractionHandlerRefs.handleWaveformRegionClickRef.current = input.handleWaveformRegionClick;
    input.waveformInteractionHandlerRefs.handleWaveformRegionDoubleClickRef.current = input.handleWaveformRegionDoubleClick;
    input.waveformInteractionHandlerRefs.handleWaveformRegionCreateRef.current = input.handleWaveformRegionCreate;
    input.waveformInteractionHandlerRefs.handleWaveformRegionContextMenuRef.current = input.handleWaveformRegionContextMenu;
    input.waveformInteractionHandlerRefs.handleWaveformRegionUpdateRef.current = input.handleWaveformRegionUpdate;
    input.waveformInteractionHandlerRefs.handleWaveformRegionUpdateEndRef.current = input.handleWaveformRegionUpdateEnd;
    input.waveformInteractionHandlerRefs.handleWaveformTimeUpdateRef.current = input.handleWaveformTimeUpdate;
    input.splitAtTimeRef.current = input.handleSplitAtTimeRequest;
    input.zoomToSegmentRef.current = input.handleZoomToSegmentRequest;

    return () => {
      input.waveformInteractionHandlerRefs.handleWaveformRegionAltPointerDownRef.current = undefined;
      input.waveformInteractionHandlerRefs.handleWaveformRegionClickRef.current = undefined;
      input.waveformInteractionHandlerRefs.handleWaveformRegionDoubleClickRef.current = undefined;
      input.waveformInteractionHandlerRefs.handleWaveformRegionCreateRef.current = undefined;
      input.waveformInteractionHandlerRefs.handleWaveformRegionContextMenuRef.current = undefined;
      input.waveformInteractionHandlerRefs.handleWaveformRegionUpdateRef.current = undefined;
      input.waveformInteractionHandlerRefs.handleWaveformRegionUpdateEndRef.current = undefined;
      input.waveformInteractionHandlerRefs.handleWaveformTimeUpdateRef.current = undefined;
      input.splitAtTimeRef.current = undefined;
      input.zoomToSegmentRef.current = undefined;
    };
  }, [
    input.handleSplitAtTimeRequest,
    input.handleWaveformRegionAltPointerDown,
    input.handleWaveformRegionClick,
    input.handleWaveformRegionContextMenu,
    input.handleWaveformRegionCreate,
    input.handleWaveformRegionDoubleClick,
    input.handleWaveformRegionUpdate,
    input.handleWaveformRegionUpdateEnd,
    input.handleWaveformTimeUpdate,
    input.handleZoomToSegmentRequest,
    input.splitAtTimeRef,
    input.waveformInteractionHandlerRefs,
    input.zoomToSegmentRef,
  ]);
}