import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import { isWaveformDisplayMode, type WaveformDisplayMode } from '../utils/waveformDisplayMode';
import { isWaveformVisualStyle, type WaveformVisualStyle } from '../utils/waveformVisualStyle';

interface WaveformResizeState {
  startY: number;
  startHeight: number;
  startAmplitude: number;
}

interface UseWaveformRuntimeControllerResult {
  waveformHeight: number;
  amplitudeScale: number;
  setAmplitudeScale: Dispatch<SetStateAction<number>>;
  waveformDisplayMode: WaveformDisplayMode;
  setWaveformDisplayMode: Dispatch<SetStateAction<WaveformDisplayMode>>;
  waveformVisualStyle: WaveformVisualStyle;
  setWaveformVisualStyle: Dispatch<SetStateAction<WaveformVisualStyle>>;
  isResizingWaveform: boolean;
  handleWaveformResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

function readStoredClampedNumber(key: string, min: number, max: number, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = Number(stored);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
  } catch {
    return fallback;
  }
}

function readStoredWaveformVisualStyle(): WaveformVisualStyle {
  try {
    const stored = localStorage.getItem('jieyu:waveform-visual-style');
    if (!stored || !isWaveformVisualStyle(stored)) return 'balanced';
    return stored;
  } catch {
    return 'balanced';
  }
}

function readStoredWaveformDisplayMode(): WaveformDisplayMode {
  try {
    const stored = localStorage.getItem('jieyu:waveform-display-mode');
    if (!stored || !isWaveformDisplayMode(stored)) return 'waveform';
    return stored;
  } catch {
    return 'waveform';
  }
}

export function useWaveformRuntimeController(): UseWaveformRuntimeControllerResult {
  const [waveformHeight, setWaveformHeight] = useState<number>(() => readStoredClampedNumber('jieyu:waveform-height', 80, 400, 180));
  const [amplitudeScale, setAmplitudeScale] = useState<number>(() => readStoredClampedNumber('jieyu:amplitude-scale', 0.25, 4, 1));
  const [waveformDisplayMode, setWaveformDisplayMode] = useState<WaveformDisplayMode>(() => readStoredWaveformDisplayMode());
  const [waveformVisualStyle, setWaveformVisualStyle] = useState<WaveformVisualStyle>(() => readStoredWaveformVisualStyle());
  const waveformResizeRef = useRef<WaveformResizeState | null>(null);
  const [isResizingWaveform, setIsResizingWaveform] = useState(false);

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

  // 持久化波形高度 | Persist waveform height
  useEffect(() => {
    try {
      localStorage.setItem('jieyu:waveform-height', String(waveformHeight));
    } catch {
      // no-op
    }
  }, [waveformHeight]);

  // 持久化增益倍率 | Persist amplitude scale
  useEffect(() => {
    try {
      localStorage.setItem('jieyu:amplitude-scale', String(amplitudeScale));
    } catch {
      // no-op
    }
  }, [amplitudeScale]);

  useEffect(() => {
    try {
      localStorage.setItem('jieyu:waveform-display-mode', waveformDisplayMode);
    } catch {
      // no-op
    }
  }, [waveformDisplayMode]);

  useEffect(() => {
    try {
      localStorage.setItem('jieyu:waveform-visual-style', waveformVisualStyle);
    } catch {
      // no-op
    }
  }, [waveformVisualStyle]);

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
    isResizingWaveform,
    handleWaveformResizeStart,
  };
}
