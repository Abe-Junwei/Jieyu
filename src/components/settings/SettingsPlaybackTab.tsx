import { useState, useCallback, useEffect } from 'react';
import { OptionGroup, SettingRow, SettingsSection } from '../settingsModalPrimitives';
import {
  PLAYBACK_RATES,
  DEFAULT_PLAYBACK_RATE_KEY,
  WORKSPACE_AUTO_SCROLL_KEY,
  WORKSPACE_SNAP_KEY,
  WORKSPACE_DEFAULT_ZOOM_MODE_KEY,
  ACCESSIBILITY_REDUCED_MOTION_KEY,
  ACCESSIBILITY_HIGH_CONTRAST_KEY,
} from './settingsConstants';
import {
  readDefaultPlaybackRate,
  readStoredBoolean,
  readStoredWorkspaceZoomMode,
  readStoredWaveformDisplayMode,
} from './settingsHelpers';
import {
  readStoredWaveformDoubleClickAction,
  readStoredNewSegmentSelectionBehavior,
  NEW_SEGMENT_SELECTION_BEHAVIOR_KEY,
  WAVEFORM_DOUBLE_CLICK_ACTION_KEY,
  type WaveformDoubleClickAction,
  type NewSegmentSelectionBehavior,
} from '../../utils/transcriptionInteractionPreferences';
import {
  readStoredWaveformHeightPreference,
  readStoredWaveformAmplitudeScalePreference,
  readStoredWaveformVisualStylePreference,
  readStoredAcousticOverlayModePreference,
  WAVEFORM_DISPLAY_MODE_STORAGE_KEY,
  WAVEFORM_HEIGHT_STORAGE_KEY,
  WAVEFORM_AMPLITUDE_SCALE_STORAGE_KEY,
  WAVEFORM_VISUAL_STYLE_STORAGE_KEY,
  ACOUSTIC_OVERLAY_MODE_STORAGE_KEY,
  emitWaveformRuntimePreferenceChanged,
} from '../../utils/waveformRuntimePreferenceSync';
import { ACOUSTIC_OVERLAY_MODES, type AcousticOverlayMode } from '../../utils/acousticOverlayTypes';
import {
  WAVEFORM_VISUAL_STYLE_OPTIONS,
  type WaveformVisualStyle,
} from '../../utils/waveformVisualStyle';
import {
  readStoredVideoLayoutModePreference,
  readStoredVideoPreviewHeightPreference,
  readStoredVideoRightPanelWidthPreference,
  WORKSPACE_VIDEO_LAYOUT_MODE_STORAGE_KEY,
  WORKSPACE_VIDEO_PREVIEW_HEIGHT_STORAGE_KEY,
  WORKSPACE_VIDEO_RIGHT_PANEL_WIDTH_STORAGE_KEY,
  emitWorkspaceLayoutPreferenceChanged,
} from '../../utils/workspaceLayoutPreferenceSync';
import type { SettingsModalMessages } from '../../i18n/messages';
import type { Locale } from '../../i18n';
import type {
  WorkspaceZoomMode,
  WaveformDisplayPreference,
  VideoLayoutPreference,
} from './settingsConstants';

interface SettingsPlaybackTabProps {
  locale: Locale;
  msg: SettingsModalMessages;
}

export function SettingsPlaybackTab({ locale: _locale, msg }: SettingsPlaybackTabProps) {
  const [defaultPlaybackRate, setDefaultPlaybackRate] = useState(readDefaultPlaybackRate);
  const [workspaceAutoScrollDefault, setWorkspaceAutoScrollDefault] = useState<boolean>(() =>
    readStoredBoolean(WORKSPACE_AUTO_SCROLL_KEY, true),
  );
  const [workspaceSnapDefault, setWorkspaceSnapDefault] = useState<boolean>(() =>
    readStoredBoolean(WORKSPACE_SNAP_KEY, false),
  );
  const [workspaceZoomModeDefault, setWorkspaceZoomModeDefault] = useState<WorkspaceZoomMode>(
    readStoredWorkspaceZoomMode,
  );
  const [waveformDoubleClickActionDefault, setWaveformDoubleClickActionDefault] =
    useState<WaveformDoubleClickAction>(readStoredWaveformDoubleClickAction);
  const [newSegmentSelectionBehaviorDefault, setNewSegmentSelectionBehaviorDefault] =
    useState<NewSegmentSelectionBehavior>(readStoredNewSegmentSelectionBehavior);
  const [waveformDisplayDefault, setWaveformDisplayDefault] = useState<WaveformDisplayPreference>(
    readStoredWaveformDisplayMode,
  );
  const [waveformDefaultHeight, setWaveformDefaultHeight] = useState<number>(
    readStoredWaveformHeightPreference,
  );
  const [waveformAmplitudeDefault, setWaveformAmplitudeDefault] = useState<number>(
    readStoredWaveformAmplitudeScalePreference,
  );
  const [waveformVisualStyleDefault, setWaveformVisualStyleDefault] = useState<WaveformVisualStyle>(
    readStoredWaveformVisualStylePreference,
  );
  const [waveformOverlayDefault, setWaveformOverlayDefault] = useState<AcousticOverlayMode>(
    readStoredAcousticOverlayModePreference,
  );
  const [videoLayoutDefault, setVideoLayoutDefault] = useState<VideoLayoutPreference>(
    readStoredVideoLayoutModePreference,
  );
  const [videoPreviewHeightDefault, setVideoPreviewHeightDefault] = useState<number>(
    readStoredVideoPreviewHeightPreference,
  );
  const [videoRightPanelWidthDefault, setVideoRightPanelWidthDefault] = useState<number>(
    readStoredVideoRightPanelWidthPreference,
  );
  const [reducedMotionEnabled, setReducedMotionEnabled] = useState<boolean>(() =>
    readStoredBoolean(ACCESSIBILITY_REDUCED_MOTION_KEY, false),
  );
  const [highContrastEnabled, setHighContrastEnabled] = useState<boolean>(() =>
    readStoredBoolean(ACCESSIBILITY_HIGH_CONTRAST_KEY, false),
  );

  const handlePlaybackRateChange = (rate: number) => {
    setDefaultPlaybackRate(rate);
    try {
      localStorage.setItem(DEFAULT_PLAYBACK_RATE_KEY, String(rate));
    } catch {
      /* ignore */
    }
  };

  const handleWorkspaceAutoScrollChange = (enabled: boolean) => {
    setWorkspaceAutoScrollDefault(enabled);
    try {
      localStorage.setItem(WORKSPACE_AUTO_SCROLL_KEY, enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const handleWorkspaceSnapChange = (enabled: boolean) => {
    setWorkspaceSnapDefault(enabled);
    try {
      localStorage.setItem(WORKSPACE_SNAP_KEY, enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const handleWorkspaceZoomModeChange = (mode: WorkspaceZoomMode) => {
    setWorkspaceZoomModeDefault(mode);
    try {
      localStorage.setItem(WORKSPACE_DEFAULT_ZOOM_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const handleVideoLayoutDefaultChange = useCallback((mode: VideoLayoutPreference) => {
    setVideoLayoutDefault(mode);
    try {
      localStorage.setItem(WORKSPACE_VIDEO_LAYOUT_MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    emitWorkspaceLayoutPreferenceChanged();
  }, []);

  const handleVideoPreviewHeightDefaultChange = useCallback((nextHeight: number) => {
    const normalized = Math.min(600, Math.max(120, Math.round(nextHeight)));
    setVideoPreviewHeightDefault(normalized);
    try {
      localStorage.setItem(WORKSPACE_VIDEO_PREVIEW_HEIGHT_STORAGE_KEY, String(normalized));
    } catch {
      /* ignore */
    }
    emitWorkspaceLayoutPreferenceChanged();
  }, []);

  const handleVideoRightPanelWidthDefaultChange = useCallback((nextWidth: number) => {
    const normalized = Math.min(720, Math.max(260, Math.round(nextWidth)));
    setVideoRightPanelWidthDefault(normalized);
    try {
      localStorage.setItem(WORKSPACE_VIDEO_RIGHT_PANEL_WIDTH_STORAGE_KEY, String(normalized));
    } catch {
      /* ignore */
    }
    emitWorkspaceLayoutPreferenceChanged();
  }, []);

  const handleWaveformDoubleClickActionChange = (mode: WaveformDoubleClickAction) => {
    setWaveformDoubleClickActionDefault(mode);
    try {
      localStorage.setItem(WAVEFORM_DOUBLE_CLICK_ACTION_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const handleNewSegmentSelectionBehaviorChange = (mode: NewSegmentSelectionBehavior) => {
    setNewSegmentSelectionBehaviorDefault(mode);
    try {
      localStorage.setItem(NEW_SEGMENT_SELECTION_BEHAVIOR_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const handleWaveformDisplayDefaultChange = useCallback((mode: WaveformDisplayPreference) => {
    setWaveformDisplayDefault(mode);
    try {
      localStorage.setItem(WAVEFORM_DISPLAY_MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    emitWaveformRuntimePreferenceChanged();
  }, []);

  const handleWaveformHeightDefaultChange = useCallback((nextHeight: number) => {
    const normalized = Math.min(400, Math.max(80, Math.round(nextHeight)));
    setWaveformDefaultHeight(normalized);
    try {
      localStorage.setItem(WAVEFORM_HEIGHT_STORAGE_KEY, String(normalized));
    } catch {
      /* ignore */
    }
    emitWaveformRuntimePreferenceChanged();
  }, []);

  const handleWaveformAmplitudeDefaultChange = useCallback((nextAmplitude: number) => {
    const normalized = Math.min(4, Math.max(0.25, Number(nextAmplitude.toFixed(2))));
    setWaveformAmplitudeDefault(normalized);
    try {
      localStorage.setItem(WAVEFORM_AMPLITUDE_SCALE_STORAGE_KEY, String(normalized));
    } catch {
      /* ignore */
    }
    emitWaveformRuntimePreferenceChanged();
  }, []);

  const handleWaveformVisualStyleDefaultChange = useCallback((style: WaveformVisualStyle) => {
    setWaveformVisualStyleDefault(style);
    try {
      localStorage.setItem(WAVEFORM_VISUAL_STYLE_STORAGE_KEY, style);
    } catch {
      /* ignore */
    }
    emitWaveformRuntimePreferenceChanged();
  }, []);

  const handleWaveformOverlayDefaultChange = useCallback((mode: AcousticOverlayMode) => {
    setWaveformOverlayDefault(mode);
    try {
      localStorage.setItem(ACOUSTIC_OVERLAY_MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    emitWaveformRuntimePreferenceChanged();
  }, []);

  const handleReducedMotionChange = (enabled: boolean) => {
    setReducedMotionEnabled(enabled);
    try {
      localStorage.setItem(ACCESSIBILITY_REDUCED_MOTION_KEY, enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const handleHighContrastChange = (enabled: boolean) => {
    setHighContrastEnabled(enabled);
    try {
      localStorage.setItem(ACCESSIBILITY_HIGH_CONTRAST_KEY, enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    document.documentElement.classList.toggle('jieyu-reduced-motion', reducedMotionEnabled);
  }, [reducedMotionEnabled]);

  useEffect(() => {
    document.documentElement.classList.toggle('jieyu-high-contrast', highContrastEnabled);
  }, [highContrastEnabled]);

  const toggleOptions = [
    { value: 'off' as const, label: msg.toggleOff },
    { value: 'on' as const, label: msg.toggleOn },
  ];

  const workspaceZoomModeOptions = [
    { value: 'fit-all' as const, label: msg.zoomModeFitAll },
    { value: 'fit-selection' as const, label: msg.zoomModeFitSelection },
    { value: 'custom' as const, label: msg.zoomModeCustom },
  ];

  const waveformDoubleClickActionOptions = [
    { value: 'zoom-selection' as const, label: msg.doubleClickActionZoom },
    { value: 'create-segment' as const, label: msg.doubleClickActionCreateSegment },
  ];

  const newSegmentSelectionBehaviorOptions = [
    { value: 'select-created' as const, label: msg.newSegmentSelectionSelectCreated },
    { value: 'keep-current' as const, label: msg.newSegmentSelectionKeepCurrent },
  ];

  const waveformDisplayOptions = [
    { value: 'waveform' as const, label: msg.waveformDisplayWaveform },
    { value: 'spectrogram' as const, label: msg.waveformDisplaySpectrogram },
    { value: 'split' as const, label: msg.waveformDisplaySplit },
  ];

  const waveformVisualStyleOptions = WAVEFORM_VISUAL_STYLE_OPTIONS.map((style) => {
    const labelMap: Record<WaveformVisualStyle, string> = {
      balanced: msg.waveformVisualStyleBalanced,
      dense: msg.waveformVisualStyleDense,
      contrast: msg.waveformVisualStyleContrast,
      line: msg.waveformVisualStyleLine,
    };
    return {
      value: style,
      label: labelMap[style],
    };
  });

  const waveformOverlayOptions = ACOUSTIC_OVERLAY_MODES.map((mode) => {
    const labelMap: Record<AcousticOverlayMode, string> = {
      none: msg.waveformOverlayNone,
      f0: msg.waveformOverlayF0,
      intensity: msg.waveformOverlayIntensity,
      both: msg.waveformOverlayBoth,
    };
    return {
      value: mode,
      label: labelMap[mode],
    };
  });

  const videoLayoutModeOptions = [
    { value: 'top' as const, label: msg.videoLayoutTop },
    { value: 'left' as const, label: msg.videoLayoutLeft },
    { value: 'right' as const, label: msg.videoLayoutRight },
  ];

  return (
    <div className="settings-sections-stack">
      <SettingsSection title={msg.playbackDefaultsTitle}>
        <OptionGroup
          value={String(defaultPlaybackRate)}
          options={PLAYBACK_RATES.map((r) => ({ value: String(r), label: `${r}×` }))}
          onChange={(v) => handlePlaybackRateChange(Number(v))}
        />
      </SettingsSection>

      <SettingsSection title={msg.workflowDefaultsTitle}>
        <SettingRow label={msg.workflowAutoFollowLabel}>
          <OptionGroup
            value={workspaceAutoScrollDefault ? 'on' : 'off'}
            options={toggleOptions}
            onChange={(value) => handleWorkspaceAutoScrollChange(value === 'on')}
          />
        </SettingRow>
        <SettingRow label={msg.workflowSnapLabel}>
          <OptionGroup
            value={workspaceSnapDefault ? 'on' : 'off'}
            options={toggleOptions}
            onChange={(value) => handleWorkspaceSnapChange(value === 'on')}
          />
        </SettingRow>
        <SettingRow label={msg.workflowZoomModeLabel}>
          <OptionGroup
            value={workspaceZoomModeDefault}
            options={workspaceZoomModeOptions}
            onChange={handleWorkspaceZoomModeChange}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={msg.videoLayoutDefaultsTitle}>
        <SettingRow label={msg.videoLayoutModeLabel}>
          <OptionGroup
            value={videoLayoutDefault}
            options={videoLayoutModeOptions}
            onChange={handleVideoLayoutDefaultChange}
          />
        </SettingRow>
        <SettingRow label={msg.videoPreviewHeightLabel}>
          <div className="settings-range-control">
            <input
              type="range"
              className="settings-font-scale-slider"
              aria-label={msg.videoPreviewHeightLabel}
              min={120}
              max={600}
              step={10}
              value={videoPreviewHeightDefault}
              onChange={(e) => handleVideoPreviewHeightDefaultChange(Number(e.target.value))}
            />
            <span className="settings-range-value">{videoPreviewHeightDefault}px</span>
          </div>
        </SettingRow>
        <SettingRow label={msg.videoRightPanelWidthLabel}>
          <div className="settings-range-control">
            <input
              type="range"
              className="settings-font-scale-slider"
              aria-label={msg.videoRightPanelWidthLabel}
              min={260}
              max={720}
              step={10}
              value={videoRightPanelWidthDefault}
              onChange={(e) => handleVideoRightPanelWidthDefaultChange(Number(e.target.value))}
            />
            <span className="settings-range-value">{videoRightPanelWidthDefault}px</span>
          </div>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={msg.selectionEditDefaultsTitle}>
        <SettingRow label={msg.doubleClickActionLabel}>
          <OptionGroup
            value={waveformDoubleClickActionDefault}
            options={waveformDoubleClickActionOptions}
            onChange={handleWaveformDoubleClickActionChange}
          />
        </SettingRow>
        <SettingRow label={msg.newSegmentSelectionLabel}>
          <OptionGroup
            value={newSegmentSelectionBehaviorDefault}
            options={newSegmentSelectionBehaviorOptions}
            onChange={handleNewSegmentSelectionBehaviorChange}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={msg.waveformDisplayDefaultsTitle}>
        <SettingRow label={msg.waveformDisplayModeLabel}>
          <OptionGroup
            value={waveformDisplayDefault}
            options={waveformDisplayOptions}
            onChange={handleWaveformDisplayDefaultChange}
          />
        </SettingRow>
        <SettingRow label={msg.waveformHeightLabel}>
          <div className="settings-range-control">
            <input
              type="range"
              className="settings-font-scale-slider"
              aria-label={msg.waveformHeightLabel}
              min={80}
              max={400}
              step={10}
              value={waveformDefaultHeight}
              onChange={(e) => handleWaveformHeightDefaultChange(Number(e.target.value))}
            />
            <span className="settings-range-value">{waveformDefaultHeight}px</span>
          </div>
        </SettingRow>
        <SettingRow label={msg.waveformAmplitudeLabel}>
          <div className="settings-range-control">
            <input
              type="range"
              className="settings-font-scale-slider"
              aria-label={msg.waveformAmplitudeLabel}
              min={0.25}
              max={4}
              step={0.05}
              value={waveformAmplitudeDefault}
              onChange={(e) => handleWaveformAmplitudeDefaultChange(Number(e.target.value))}
            />
            <span className="settings-range-value">{waveformAmplitudeDefault.toFixed(2)}x</span>
          </div>
        </SettingRow>
        <SettingRow label={msg.waveformVisualStyleLabel}>
          <OptionGroup
            value={waveformVisualStyleDefault}
            options={waveformVisualStyleOptions}
            onChange={handleWaveformVisualStyleDefaultChange}
          />
        </SettingRow>
        <SettingRow label={msg.waveformOverlayLabel}>
          <OptionGroup
            value={waveformOverlayDefault}
            options={waveformOverlayOptions}
            onChange={handleWaveformOverlayDefaultChange}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={msg.accessibilityDefaultsTitle}>
        <SettingRow label={msg.accessibilityReducedMotionLabel}>
          <OptionGroup
            value={reducedMotionEnabled ? 'on' : 'off'}
            options={toggleOptions}
            onChange={(value) => handleReducedMotionChange(value === 'on')}
          />
        </SettingRow>
        <SettingRow label={msg.accessibilityHighContrastLabel}>
          <OptionGroup
            value={highContrastEnabled ? 'on' : 'off'}
            options={toggleOptions}
            onChange={(value) => handleHighContrastChange(value === 'on')}
          />
        </SettingRow>
      </SettingsSection>
    </div>
  );
}
