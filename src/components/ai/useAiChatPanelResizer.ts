import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { clampHeight, resolveDecisionPanelHeightBounds, resolveVoiceDrawerHeightBounds } from './aiChatCardResizerUtils';

type UseAiChatPanelResizerInput = {
  voiceDrawerExpanded: boolean;
  showDecisionPanel: boolean;
  decisionPanelBodyRef: RefObject<HTMLDivElement | null>;
};

type UseAiChatPanelResizerResult = {
  isVoiceDrawerResizing: boolean;
  isDecisionPanelResizing: boolean;
  voiceDrawerInlineStyle: CSSProperties | undefined;
  decisionPanelInlineStyle: CSSProperties | undefined;
  startVoiceDrawerResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  startDecisionPanelResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

export function useAiChatPanelResizer({
  voiceDrawerExpanded,
  showDecisionPanel,
  decisionPanelBodyRef,
}: UseAiChatPanelResizerInput): UseAiChatPanelResizerResult {
  const [voiceDrawerMaxHeight, setVoiceDrawerMaxHeight] = useState<number | null>(null);
  const [decisionPanelMaxHeight, setDecisionPanelMaxHeight] = useState<number | null>(null);
  const [isVoiceDrawerResizing, setIsVoiceDrawerResizing] = useState(false);
  const [isDecisionPanelResizing, setIsDecisionPanelResizing] = useState(false);
  const voiceResizeStartYRef = useRef(0);
  const voiceResizeStartHeightRef = useRef(0);
  const decisionResizeStartYRef = useRef(0);
  const decisionResizeStartHeightRef = useRef(0);

  const clampVoiceDrawerHeight = (value: number): number => clampHeight(
    value,
    resolveVoiceDrawerHeightBounds(typeof window === 'undefined' ? undefined : window.innerHeight),
  );

  const clampDecisionPanelHeight = (value: number): number => clampHeight(
    value,
    resolveDecisionPanelHeightBounds(typeof window === 'undefined' ? undefined : window.innerHeight),
  );

  const startVoiceDrawerResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!voiceDrawerExpanded || typeof window === 'undefined') return;
    event.preventDefault();
    const { preferred } = resolveVoiceDrawerHeightBounds(window.innerHeight);
    const initial = clampVoiceDrawerHeight(voiceDrawerMaxHeight ?? preferred);
    voiceResizeStartYRef.current = event.clientY;
    voiceResizeStartHeightRef.current = initial;
    setVoiceDrawerMaxHeight(initial);
    setIsVoiceDrawerResizing(true);
  };

  const startDecisionPanelResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!showDecisionPanel || typeof window === 'undefined') return;
    event.preventDefault();
    const { preferred } = resolveDecisionPanelHeightBounds(window.innerHeight);
    const measuredHeight = decisionPanelBodyRef.current?.getBoundingClientRect().height ?? 0;
    const initial = clampDecisionPanelHeight(measuredHeight > 0 ? measuredHeight : (decisionPanelMaxHeight ?? preferred));
    decisionResizeStartYRef.current = event.clientY;
    decisionResizeStartHeightRef.current = initial;
    setIsDecisionPanelResizing(true);
  };

  const voiceDrawerInlineStyle: CSSProperties | undefined = voiceDrawerMaxHeight !== null
    ? ({ ['--ai-voice-drawer-max-height' as string]: `${voiceDrawerMaxHeight}px` } as CSSProperties)
    : undefined;

  const decisionPanelInlineStyle: CSSProperties | undefined = decisionPanelMaxHeight !== null
    ? ({
      ['--ai-decision-panel-max-height' as string]: `${decisionPanelMaxHeight}px`,
      ['--ai-decision-panel-body-height' as string]: `${decisionPanelMaxHeight}px`,
    } as CSSProperties)
    : undefined;

  useEffect(() => {
    if (!isVoiceDrawerResizing || typeof window === 'undefined') return;

    const handlePointerMove = (event: PointerEvent): void => {
      const delta = voiceResizeStartYRef.current - event.clientY;
      setVoiceDrawerMaxHeight(clampVoiceDrawerHeight(voiceResizeStartHeightRef.current + delta));
    };

    const stopResize = (): void => {
      setIsVoiceDrawerResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isVoiceDrawerResizing]);

  useEffect(() => {
    if (!isDecisionPanelResizing || typeof window === 'undefined') return;

    const handlePointerMove = (event: PointerEvent): void => {
      const delta = decisionResizeStartYRef.current - event.clientY;
      setDecisionPanelMaxHeight(clampDecisionPanelHeight(decisionResizeStartHeightRef.current + delta));
    };

    const stopResize = (): void => {
      setIsDecisionPanelResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDecisionPanelResizing]);

  return {
    isVoiceDrawerResizing,
    isDecisionPanelResizing,
    voiceDrawerInlineStyle,
    decisionPanelInlineStyle,
    startVoiceDrawerResize,
    startDecisionPanelResize,
  };
}