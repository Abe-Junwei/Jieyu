import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { UseWaveformRuntimeControllerResult } from './waveformRuntimeStorage';
import {
  readStoredClampedNumber,
  type WaveformResizeState,
} from './waveformRuntimeStorage';
import {
  ACOUSTIC_OVERLAY_MODE_STORAGE_KEY,
  WAVEFORM_AMPLITUDE_SCALE_STORAGE_KEY,
  WAVEFORM_HEIGHT_STORAGE_KEY,
  WAVEFORM_VISUAL_STYLE_STORAGE_KEY,
  readStoredAcousticOverlayModePreference,
  readStoredWaveformAmplitudeScalePreference,
  readStoredWaveformDisplayModePreference,
  readStoredWaveformHeightPreference,
  readStoredWaveformVisualStylePreference,
  subscribeWaveformRuntimePreferenceChanged,
} from '../utils/waveformRuntimePreferenceSync';

export function useWaveformRuntimeController(): UseWaveformRuntimeControllerResult {
  const [waveformHeight, setWaveformHeight] = useState<number>(readStoredWaveformHeightPreference);
  const [amplitudeScale, setAmplitudeScale] = useState<number>(readStoredWaveformAmplitudeScalePreference);
  const [waveformDisplayMode, setWaveformDisplayMode] = useState<WaveformDisplayMode>(readStoredWaveformDisplayModePreference);
  const [waveformVisualStyle, setWaveformVisualStyle] = useState<WaveformVisualStyle>(readStoredWaveformVisualStylePreference);
  const [acousticOverlayMode, setAcousticOverlayMode] = useState<AcousticOverlayMode>(readStoredAcousticOverlayModePreference);
  const waveformResizeRef = useRef<WaveformResizeState | null>(null);
  const [isResizingWaveform, setIsResizingWaveform] = useState(false);
  /** 记录非 split 模式下用户设置的基础高度，用于从 split 切回时恢复 */
  const baseHeightRef = useRef(readStoredClampedNumber(WAVEFORM_HEIGHT_STORAGE_KEY, 80, 400, 180));
  const previousWaveformDisplayModeRef = useRef<WaveformDisplayMode>(waveformDisplayMode);

  // 切换到 split 模式时自动扩展高度，确保两个面板都有足够空间
  // Auto-expand height when switching to split mode so both panels have room
  useEffect(() => {
    const previousMode = previousWaveformDisplayModeRef.current;
    previousWaveformDisplayModeRef.current = waveformDisplayMode;

    if (waveformDisplayMode === 'split') {
      if (waveformHeight < 240) {
        baseHeightRef.current = waveformHeight;
        setWaveformHeight(260);
      }
    } else {
      // 从 split 切回时恢复之前的基础高度 | Restore base height when leaving split
      if (previousMode === 'split' && baseHeightRef.current > 0 && baseHeightRef.current < 240) {
        setWaveformHeight(baseHeightRef.current);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to mode changes
  }, [waveformDisplayMode]);

  const handleWaveformResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    waveformResizeRef.current = {
      startY: event.clientY,
      startHeight: waveformHeight,
      startAmplitude: amplitudeScale,
    };
    setIsResizingWaveform(true);
  }, [amplitudeScale, waveformHeight]);

  useEffect(() => {
    try {
      localStorage.setItem('jieyu:waveform-height', String(waveformHeight));
      localStorage.setItem(WAVEFORM_AMPLITUDE_SCALE_STORAGE_KEY, String(amplitudeScale));
      localStorage.setItem('jieyu:waveform-display-mode', waveformDisplayMode);
      localStorage.setItem(WAVEFORM_VISUAL_STYLE_STORAGE_KEY, waveformVisualStyle);
      localStorage.setItem(ACOUSTIC_OVERLAY_MODE_STORAGE_KEY, acousticOverlayMode);
    } catch {
      // no-op
    }
  }, [acousticOverlayMode, amplitudeScale, waveformDisplayMode, waveformHeight, waveformVisualStyle]);

  // 监听设置面板变更事件，保证当前转写页立刻应用波形默认值 | Listen to settings changes so active transcription view updates immediately
  useEffect(() => subscribeWaveformRuntimePreferenceChanged(() => {
    const nextHeight = readStoredWaveformHeightPreference();
    const nextAmplitudeScale = readStoredWaveformAmplitudeScalePreference();
    const nextDisplayMode = readStoredWaveformDisplayModePreference();
    const nextVisualStyle = readStoredWaveformVisualStylePreference();
    const nextOverlayMode = readStoredAcousticOverlayModePreference();
    setWaveformHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    setAmplitudeScale((prev) => (prev === nextAmplitudeScale ? prev : nextAmplitudeScale));
    setWaveformDisplayMode((prev) => (prev === nextDisplayMode ? prev : nextDisplayMode));
    setWaveformVisualStyle((prev) => (prev === nextVisualStyle ? prev : nextVisualStyle));
    setAcousticOverlayMode((prev) => (prev === nextOverlayMode ? prev : nextOverlayMode));
  }), []);

  // 波形拖拽改变高度与增益倍率 | Resize waveform and sync amplitude while dragging
  useEffect(() => {
    if (!isResizingWaveform) return;

    const handleMove = (event: PointerEvent): void => {
      const drag = waveformResizeRef.current;
      if (!drag) return;

      const nextHeight = Math.min(Math.max(Math.round(drag.startHeight + event.clientY - drag.startY), 80), 400);
      setWaveformHeight(nextHeight);

      if (drag.startHeight > 0) {
        const ratio = nextHeight / drag.startHeight;
        const nextAmplitude = Math.min(Math.max(Number((drag.startAmplitude * ratio).toFixed(2)), 0.25), 4);
        setAmplitudeScale(nextAmplitude);
      }
    };

    const stop = (): void => {
      waveformResizeRef.current = null;
      setIsResizingWaveform(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizingWaveform]);

  return {
    waveformHeight,
    amplitudeScale,
    setAmplitudeScale,
    waveformDisplayMode,
    setWaveformDisplayMode,
    waveformVisualStyle,
    setWaveformVisualStyle,
    acousticOverlayMode,
    setAcousticOverlayMode,
    isResizingWaveform,
    handleWaveformResizeStart,
  };
}
