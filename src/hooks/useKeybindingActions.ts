import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { UtteranceDocType } from '../db';
import { isUtteranceTimelineUnit, type TimelineUnit } from './transcriptionTypes';
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
  selectedTimelineUnit?: TimelineUnit | null;
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
  selectTimelineUnit?: (unit: TimelineUnit | null) => void;
  selectUtterance: (id: string) => void;
  selectAllUtterances: () => void;
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
    selectedUtterance, selectedTimelineUnit, selectedUtteranceIds,
    selectedMediaUrl,
    segMarkStart, setSegMarkStart,
    segmentLoopPlayback, setSegmentLoopPlayback,
    utterancesOnCurrentMedia,
    markingModeRef, skipSeekForIdRef, creatingSegmentRef, manualSelectTsRef,
    waveformAreaRef,
    createUtteranceFromSelection,
    selectTimelineUnit,
    selectUtterance, selectAllUtterances,
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
  const activeSelectionId = selectedTimelineUnit?.unitId ?? '';
  const activeUtteranceId = isUtteranceTimelineUnit(selectedTimelineUnit)
    ? selectedTimelineUnit.unitId
    : '';

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
              if (!markingModeRef.current) return;
              selectTimelineUnit?.(null);
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
        runDeleteSelection(activeSelectionId, selectedUtteranceIds);
      },
      mergePrev: () => { runMergePrev(activeSelectionId); },
      mergeNext: () => { runMergeNext(activeSelectionId); },
      splitSegment: () => {
        if (!activeSelectionId) return;
        const ws = player.instanceRef.current;
        if (ws) runSplitAtTime(activeSelectionId, ws.getCurrentTime());
      },
      selectBefore: () => { runSelectBefore(activeSelectionId); },
      selectAfter:  () => { runSelectAfter(activeSelectionId); },
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
        if (!activeUtteranceId) return;
        const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === activeUtteranceId);
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
        if (!activeUtteranceId) return;
        const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === activeUtteranceId);
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
        if (!activeUtteranceId) return;
        const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === activeUtteranceId);
        const target = utterancesOnCurrentMedia[idx + 1];
        if (target) {
          manualSelectTsRef.current = Date.now();
          selectUtterance(target.id);
          if (player.isReady) player.playRegion(target.startTime, target.endTime);
        }
      },
      tabPrev: () => {
        if (!activeUtteranceId) return;
        const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === activeUtteranceId);
        const target = utterancesOnCurrentMedia[idx - 1];
        if (target) {
          manualSelectTsRef.current = Date.now();
          selectUtterance(target.id);
          if (player.isReady) player.playRegion(target.startTime, target.endTime);
        }
      },
      reviewNext: () => {
        // 跳到当前句段之后第一个低置信度句段（< 0.75）| Jump to next low-confidence utterance after current
        const curIdx = activeUtteranceId
          ? utterancesOnCurrentMedia.findIndex((u) => u.id === activeUtteranceId)
          : -1;
        const lowList = utterancesOnCurrentMedia
          .map((u, i) => ({ u, i }))
          .filter(({ u }) => typeof u.ai_metadata?.confidence === 'number' && u.ai_metadata.confidence < 0.75);
        const target = lowList.find(({ i }) => i > curIdx);
        if (target) {
          manualSelectTsRef.current = Date.now();
          if (player.isPlaying) player.stop();
          selectUtterance(target.u.id);
          if (player.isReady) player.playRegion(target.u.startTime, target.u.endTime);
        }
      },
      reviewPrev: () => {
        // 跳到当前句段之前最近一个低置信度句段（< 0.75）| Jump to prev low-confidence utterance before current
        const curIdx = activeUtteranceId
          ? utterancesOnCurrentMedia.findIndex((u) => u.id === activeUtteranceId)
          : utterancesOnCurrentMedia.length;
        const lowList = utterancesOnCurrentMedia
          .map((u, i) => ({ u, i }))
          .filter(({ u }) => typeof u.ai_metadata?.confidence === 'number' && u.ai_metadata.confidence < 0.75)
          .filter(({ i }) => i < curIdx);
        const target = lowList[lowList.length - 1];
        if (target) {
          manualSelectTsRef.current = Date.now();
          if (player.isPlaying) player.stop();
          selectUtterance(target.u.id);
          if (player.isReady) player.playRegion(target.u.startTime, target.u.endTime);
        }
      },
    };
  }, [activeSelectionId, activeUtteranceId, handlePlayPauseAction, player, player.isReady, player.isPlaying, selectedMediaUrl, segMarkStart, subSelectionRange, selectedUtteranceIds, utterancesOnCurrentMedia, createUtteranceFromSelection, runDeleteSelection, runMergePrev, runMergeNext, runSplitAtTime, runSelectBefore, runSelectAfter, selectAllUtterances, selectUtterance, selectTimelineUnit, manualSelectTsRef]);

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
      const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === activeUtteranceId);
      if (idx < 0) return;
      const target = utterancesOnCurrentMedia[idx + direction];
      if (target) {
        manualSelectTsRef.current = Date.now();
        selectUtterance(target.id);
        if (player.isReady) player.playRegion(target.startTime, target.endTime);
      }
    },
    [utterancesOnCurrentMedia, activeUtteranceId, selectUtterance, player, manualSelectTsRef],
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
