import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { UtteranceDocType } from '../../db';
import { DEFAULT_KEYBINDINGS, getEffectiveKeymap, matchKeyEvent } from '../services/KeybindingService';
import { fireAndForget } from '../utils/fireAndForget';

interface UseKeybindingActionsInput {
  player: {
    isReady: boolean;
    isPlaying: boolean;
    playbackRate: number;
    instanceRef: React.RefObject<import('wavesurfer.js').default | null>;
    stop: () => void;
    playRegion: (start: number, end: number, force?: boolean) => void;
    togglePlayback: () => void;
    seekBySeconds: (delta: number) => void;
  };
  subSelectionRange: { start: number; end: number } | null;
  setSubSelectionRange: React.Dispatch<React.SetStateAction<{ start: number; end: number } | null>>;
  selectedUtterance: UtteranceDocType | undefined;
  selectedUtteranceId: string;
  selectedUtteranceIds: Set<string>;
  selectedMediaUrl: string | undefined;
  segMarkStart: number | null;
  setSegMarkStart: React.Dispatch<React.SetStateAction<number | null>>;
  segmentLoopPlayback: boolean;
  setSegmentLoopPlayback: React.Dispatch<React.SetStateAction<boolean>>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  // Refs for avoiding re-render churn
  markingModeRef: React.MutableRefObject<boolean>;
  skipSeekForIdRef: React.MutableRefObject<string | null>;
  creatingSegmentRef: React.MutableRefObject<boolean>;
  manualSelectTsRef: React.MutableRefObject<number>;
  waveformAreaRef: React.RefObject<HTMLDivElement | null>;
  // Utterance operations
  createUtteranceFromSelection: (start: number, end: number) => Promise<void>;
  selectUtterance: (id: string) => void;
  selectAllUtterances: () => void;
  setSelectedUtteranceId: React.Dispatch<React.SetStateAction<string>>;
  runDeleteSelection: (id: string, ids: Set<string>) => void;
  runMergePrev: (id: string) => void;
  runMergeNext: (id: string) => void;
  runSplitAtTime: (id: string, time: number) => void;
  runSelectBefore: (id: string) => void;
  runSelectAfter: (id: string) => void;
  // Global actions
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>;
  toggleNotes: () => void;
  toggleVoice?: () => void;
}

export function useKeybindingActions(input: UseKeybindingActionsInput) {
  const {
    player,
    subSelectionRange, setSubSelectionRange,
    selectedUtterance, selectedUtteranceId, selectedUtteranceIds,
    selectedMediaUrl,
    segMarkStart, setSegMarkStart,
    segmentLoopPlayback, setSegmentLoopPlayback,
    utterancesOnCurrentMedia,
    markingModeRef, skipSeekForIdRef, creatingSegmentRef, manualSelectTsRef,
    waveformAreaRef,
    createUtteranceFromSelection,
    selectUtterance, selectAllUtterances, setSelectedUtteranceId,
    runDeleteSelection, runMergePrev, runMergeNext, runSplitAtTime,
    runSelectBefore, runSelectAfter,
    undo, redo, setShowSearch, toggleNotes, toggleVoice,
  } = input;

  const keymap = useMemo(() => getEffectiveKeymap(), []);

  // Segment-focused play action
  const handlePlayPauseAction = useCallback(() => {
    if (!player.isReady) return;
    if (player.isPlaying) {
      player.stop();
    } else if (subSelectionRange) {
      player.playRegion(subSelectionRange.start, subSelectionRange.end, true);
    } else if (selectedUtterance) {
      player.playRegion(selectedUtterance.startTime, selectedUtterance.endTime, true);
    } else {
      player.togglePlayback();
    }
  }, [player, subSelectionRange, selectedUtterance]);

  // Top toolbar play button controls global timeline playback.
  const handleGlobalPlayPauseAction = useCallback(() => {
    if (segmentLoopPlayback) {
      setSegmentLoopPlayback(false);
    }
    player.togglePlayback();
  }, [player, segmentLoopPlayback, setSegmentLoopPlayback]);

  // Action dispatch table — stored in a ref to avoid re-creating on every render.
  // The individual callbacks are stable via useCallback; we mutate .current in useEffect.
  const waveformActionsRef = useRef<Record<string, (e: KeyboardEvent | React.KeyboardEvent) => void>>({});

  useEffect(() => {
    waveformActionsRef.current = {
      playPause: () => { handlePlayPauseAction(); },
      markSegment: () => {
        const ws = player.instanceRef.current;
        if (!ws || !player.isReady || !selectedMediaUrl) return;
        const now = ws.getCurrentTime();
        if (segMarkStart === null) {
          markingModeRef.current = true;
          setSegMarkStart(now);
          if (!player.isPlaying) player.togglePlayback();
        } else {
          const s = Math.min(segMarkStart, now);
          const end = Math.max(segMarkStart, now);
          if (end - s >= 0.05) {
            skipSeekForIdRef.current = '__next_created__';
            creatingSegmentRef.current = true;
            fireAndForget(createUtteranceFromSelection(s, end).then(() => {
              if (markingModeRef.current) setSelectedUtteranceId('');
            }).finally(() => { creatingSegmentRef.current = false; }));
          }
          setSegMarkStart(null);
        }
      },
      cancel: () => {
        if (subSelectionRange) { setSubSelectionRange(null); return; }
        markingModeRef.current = false;
        if (segMarkStart !== null) {
          setSegMarkStart(null);
          if (player.isPlaying) player.togglePlayback();
        }
      },
      deleteSegment: () => {
        runDeleteSelection(selectedUtteranceId, selectedUtteranceIds);
      },
      mergePrev: () => { runMergePrev(selectedUtteranceId); },
      mergeNext: () => { runMergeNext(selectedUtteranceId); },
      splitSegment: () => {
        if (!selectedUtteranceId) return;
        const ws = player.instanceRef.current;
        if (ws) runSplitAtTime(selectedUtteranceId, ws.getCurrentTime());
      },
      selectBefore: () => { runSelectBefore(selectedUtteranceId); },
      selectAfter:  () => { runSelectAfter(selectedUtteranceId); },
      selectAll:    () => { selectAllUtterances(); },
      stepBack: () => {
        if (player.isPlaying) player.stop();
        player.seekBySeconds(-(1 / 25));
      },
      stepForward: () => {
        if (player.isPlaying) player.stop();
        player.seekBySeconds(1 / 25);
      },
      navPrev: (e) => {
        if (!selectedUtteranceId) return;
        const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === selectedUtteranceId);
        const target = utterancesOnCurrentMedia[idx - 1];
        if (target) {
          manualSelectTsRef.current = Date.now();
          if (player.isPlaying) {
            player.stop();
          }
          selectUtterance(target.id);
          const el = (e.target as HTMLElement).closest('[tabindex]') as HTMLElement | null;
          if (el) requestAnimationFrame(() => el.focus());
        }
      },
      navNext: (e) => {
        if (!selectedUtteranceId) return;
        const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === selectedUtteranceId);
        const target = utterancesOnCurrentMedia[idx + 1];
        if (target) {
          manualSelectTsRef.current = Date.now();
          if (player.isPlaying) {
            player.stop();
          }
          selectUtterance(target.id);
          const el = (e.target as HTMLElement).closest('[tabindex]') as HTMLElement | null;
          if (el) requestAnimationFrame(() => el.focus());
        }
      },
      tabNext: () => {
        if (!selectedUtteranceId) return;
        const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === selectedUtteranceId);
        const target = utterancesOnCurrentMedia[idx + 1];
        if (target) {
          manualSelectTsRef.current = Date.now();
          selectUtterance(target.id);
          if (player.isReady) player.playRegion(target.startTime, target.endTime);
        }
      },
      tabPrev: () => {
        if (!selectedUtteranceId) return;
        const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === selectedUtteranceId);
        const target = utterancesOnCurrentMedia[idx - 1];
        if (target) {
          manualSelectTsRef.current = Date.now();
          selectUtterance(target.id);
          if (player.isReady) player.playRegion(target.startTime, target.endTime);
        }
      },
    };
  }, [handlePlayPauseAction, player, player.isReady, player.isPlaying, selectedMediaUrl, segMarkStart, subSelectionRange, selectedUtteranceId, selectedUtteranceIds, utterancesOnCurrentMedia, createUtteranceFromSelection, runDeleteSelection, runMergePrev, runMergeNext, runSplitAtTime, runSelectBefore, runSelectAfter, selectAllUtterances, selectUtterance, manualSelectTsRef]);

  // Global keybinding handler (undo, redo, search)
  useEffect(() => {
    const globalActions: Record<string, () => void> = {
      undo:   () => fireAndForget(undo()),
      redo:   () => fireAndForget(redo()),
      search: () => setShowSearch(true),
      toggleNotes: () => toggleNotes(),
      ...(toggleVoice ? { toggleVoice } : {}),
    };
    const onKeyDown = (e: KeyboardEvent) => {
      for (const [actionId, combo] of keymap) {
        const entry = DEFAULT_KEYBINDINGS.find((b) => b.id === actionId);
        if (!entry || entry.scope !== 'global') continue;
        if (matchKeyEvent(e, combo) && globalActions[actionId]) {
          e.preventDefault();
          globalActions[actionId]();
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, keymap, setShowSearch, toggleNotes, toggleVoice]);

  // Navigate to prev/next utterance from an inline input
  const navigateUtteranceFromInput = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, direction: 1 | -1) => {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
      const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === selectedUtteranceId);
      if (idx < 0) return;
      const target = utterancesOnCurrentMedia[idx + direction];
      if (target) {
        manualSelectTsRef.current = Date.now();
        selectUtterance(target.id);
        if (player.isReady) player.playRegion(target.startTime, target.endTime);
      }
    },
    [utterancesOnCurrentMedia, selectedUtteranceId, selectUtterance, player, manualSelectTsRef],
  );

  // Waveform keydown via keybinding dispatch
  const handleWaveformKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;

    for (const [actionId, combo] of keymap) {
      const entry = DEFAULT_KEYBINDINGS.find((b) => b.id === actionId);
      if (!entry || entry.scope !== 'waveform') continue;
      if (matchKeyEvent(e, combo)) {
        e.preventDefault();
        waveformActionsRef.current[actionId]?.(e);
        return;
      }
    }
  }, [keymap]);

  // Auto-focus waveform when multiple utterances selected
  useEffect(() => {
    if (selectedUtteranceIds.size > 1) {
      waveformAreaRef.current?.focus();
    }
  }, [selectedUtteranceIds.size, waveformAreaRef]);

  /**
   * Programmatically execute any registered action by ID.
   * Used by voice agent to dispatch commands without physical keystrokes.
   */
  const executeAction = useCallback((actionId: string, params?: { segmentIndex?: number }) => {
    // Waveform-scoped actions
    const waveformAction = waveformActionsRef.current[actionId];
    if (waveformAction) {
      waveformAction(new KeyboardEvent('keydown'));
      return;
    }
    // Global actions handled inline to avoid stale closure
    switch (actionId) {
      case 'undo': fireAndForget(undo()); break;
      case 'redo': fireAndForget(redo()); break;
      case 'search': setShowSearch(true); break;
      case 'toggleNotes': toggleNotes(); break;
      case 'navToIndex': {
        const idx = params?.segmentIndex;
        if (idx == null || idx < 1) break;
        const target = utterancesOnCurrentMedia[idx - 1];
        if (!target) break;
        manualSelectTsRef.current = Date.now();
        if (player.isPlaying) player.stop();
        selectUtterance(target.id);
        if (player.isReady) player.playRegion(target.startTime, target.endTime);
        break;
      }
      default: break;
    }
  }, [undo, redo, setShowSearch, toggleNotes, utterancesOnCurrentMedia, selectUtterance, player, manualSelectTsRef]);

  return {
    handlePlayPauseAction,
    handleGlobalPlayPauseAction,
    handleWaveformKeyDown,
    navigateUtteranceFromInput,
    executeAction,
  };
}
