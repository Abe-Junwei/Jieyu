import { describe, expect, it } from 'vitest';
import {
  buildReadyWorkspaceSurfaceControllersSlice,
  buildReadyWorkspaceSurfaceLayoutSlice,
  buildReadyWorkspaceSurfaceOverlaysSlice,
  buildReadyWorkspaceSurfaceWaveformSlice,
} from './transcriptionReadyWorkspaceSurfaceNestedSlicesBuilder';
import type { BuildReadyWorkspaceLayoutStyleInputFromProps } from './transcriptionReadyWorkspaceLayoutStyleInputBuilder';
import type {
  ReadyWorkspaceSurfaceControllersSliceContract,
  ReadyWorkspaceSurfaceOverlaysSliceContract,
  ReadyWorkspaceSurfaceWaveformSliceContract,
} from './readyWorkspaceSurfaceSliceContracts';

describe('readyWorkspaceSurfaceSliceContracts', () => {
  it('controllers slice is identity (Phase B1 speaker contract bag)', () => {
    const bag = {
      speaker: {} as ReadyWorkspaceSurfaceControllersSliceContract['speaker'],
      speakerActionScope: {} as ReadyWorkspaceSurfaceControllersSliceContract['speakerActionScope'],
      selfCertainty: null,
      timeline: null,
      batch: null,
      projectMedia: null,
      importExport: null,
      playbackKeyboard: null,
      annotation: null,
      trackDisplay: null,
    } as ReadyWorkspaceSurfaceControllersSliceContract;
    expect(buildReadyWorkspaceSurfaceControllersSlice(bag)).toBe(bag);
  });

  it('overlays slice is identity (Phase B1 overlays contract)', () => {
    const stub = {} as ReadyWorkspaceSurfaceOverlaysSliceContract;
    expect(buildReadyWorkspaceSurfaceOverlaysSlice(stub)).toBe(stub);
  });

  it('layout slice is identity (Phase B3 contract)', () => {
    const layout: BuildReadyWorkspaceLayoutStyleInputFromProps = {
      uiFontScale: 1,
      adaptiveDialogWidth: 400,
      adaptiveDialogCompactWidth: 320,
      adaptiveDialogWideWidth: 720,
      aiPanelWidth: 280,
      isAiPanelCollapsed: false,
      laneLabelWidth: 120,
      isTimelineLaneHeaderCollapsed: false,
      selectedMediaUrl: null,
      selectedMediaIsVideo: false,
      videoLayoutMode: 'default',
      videoRightPanelWidth: 0,
    };
    expect(buildReadyWorkspaceSurfaceLayoutSlice(layout)).toBe(layout);
  });

  it('waveform slice is identity (Phase B2 contract)', () => {
    const stub = {} as ReadyWorkspaceSurfaceWaveformSliceContract;
    expect(buildReadyWorkspaceSurfaceWaveformSlice(stub)).toBe(stub);
  });
});
