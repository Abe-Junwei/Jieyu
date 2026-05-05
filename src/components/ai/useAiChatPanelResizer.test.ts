// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useAiChatPanelResizer } from './useAiChatPanelResizer';

describe('useAiChatPanelResizer', () => {
  it('does not start voice resize when drawer is collapsed', () => {
    const { result } = renderHook(() => useAiChatPanelResizer({
      voiceDrawerExpanded: false,
      showDecisionPanel: false,
      decisionPanelBodyRef: createRef<HTMLDivElement>(),
    }));
    act(() => {
      result.current.startVoiceDrawerResize({
        preventDefault: () => {},
        clientY: 100,
      } as unknown as ReactPointerEvent<HTMLDivElement>);
    });
    expect(result.current.isVoiceDrawerResizing).toBe(false);
  });

  it('starts decision resize when panel is open', () => {
    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, 'current', {
      value: {
        getBoundingClientRect: () => ({ height: 280 }),
      },
      writable: true,
    });
    const { result } = renderHook(() => useAiChatPanelResizer({
      voiceDrawerExpanded: false,
      showDecisionPanel: true,
      decisionPanelBodyRef: ref,
    }));
    act(() => {
      result.current.startDecisionPanelResize({
        preventDefault: () => {},
        clientY: 100,
      } as unknown as ReactPointerEvent<HTMLDivElement>);
    });
    expect(result.current.isDecisionPanelResizing).toBe(true);
  });
});
