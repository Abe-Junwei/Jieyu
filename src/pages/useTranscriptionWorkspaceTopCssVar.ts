import { useEffect } from 'react';

interface UseTranscriptionWorkspaceTopCssVarInput {
  enabled: boolean;
  screenRef: React.RefObject<HTMLElement | null>;
  waveformSectionRef: React.RefObject<HTMLElement | null>;
}

export function useTranscriptionWorkspaceTopCssVar({
  enabled,
  screenRef,
  waveformSectionRef,
}: UseTranscriptionWorkspaceTopCssVarInput) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!enabled) return;

    const waveformSection = waveformSectionRef.current;
    const shell = screenRef.current?.closest('.app-shell');
    if (!waveformSection || !(shell instanceof HTMLElement)) return;

    const syncWorkspaceTop = () => {
      const nextTop = Math.max(0, Math.round(waveformSection.getBoundingClientRect().height));
      shell.style.setProperty('--transcription-workspace-top', `${nextTop}px`);
    };

    syncWorkspaceTop();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => syncWorkspaceTop());
      observer.observe(waveformSection);
    }

    window.addEventListener('resize', syncWorkspaceTop);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncWorkspaceTop);
      shell.style.removeProperty('--transcription-workspace-top');
    };
  }, [enabled, screenRef, waveformSectionRef]);
}
