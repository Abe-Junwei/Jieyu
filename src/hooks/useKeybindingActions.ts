import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { LayerUnitDocType } from '../db';
import type { TimelineUnitView } from './timelineUnitView';
import type { TimelineUnit } from './transcriptionTypes';
import { DEFAULT_KEYBINDINGS, getEffectiveKeymap, matchKeyEvent } from '../services/KeybindingService';
import { fireAndForget } from '../utils/fireAndForget';

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  const tagName = element.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (element.isContentEditable) return true;
  return Boolean(element.closest('[contenteditable="true"]'));
}

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
  selectedUnit: LayerUnitDocType | undefined;
  selectedPlayableRange?: { startTime: number; endTime: number } | null;
  selectedTimelineUnit?: TimelineUnit | null;
  selectedUnitIds: Set<string>;
  selectedMediaUrl: string | undefined;
  segMarkStart: number | null;
  setSegMarkStart: React.Dispatch<React.SetStateAction<number | null>>;
  segmentLoopPlayback: boolean;
  setSegmentLoopPlayback: React.Dispatch<React.SetStateAction<boolean>>;
  /** Current-media timeline units (unit + segment), same order as waveform / timeline. */
  timelineUnitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  // Refs for avoiding re-render churn
  markingModeRef: React.MutableRefObject<boolean>;
  skipSeekForIdRef: React.MutableRefObject<string | null>;
  creatingSegmentRef: React.MutableRefObject<boolean>;
  manualSelectTsRef: React.MutableRefObject<number>;
  waveformAreaRef: React.RefObject<HTMLDivElement | null>;
  // Unit operations
  createUnitFromSelection: (
    start: number,
    end: number,
    options?: { selectionBehavior?: 'select-created' | 'keep-current' },
  ) => Promise<void>;
  selectTimelineUnit?: (unit: TimelineUnit | null) => void;
  selectUnit: (id: string) => void;
  selectAllUnits: () => void;
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
    selectedUnit, selectedPlayableRange, selectedTimelineUnit, selectedUnitIds,
    selectedMediaUrl,
    segMarkStart, setSegMarkStart,
    segmentLoopPlayback, setSegmentLoopPlayback,
    timelineUnitsOnCurrentMedia,
    markingModeRef, skipSeekForIdRef, creatingSegmentRef, manualSelectTsRef,
    waveformAreaRef,
    createUnitFromSelection,
    selectTimelineUnit,
    selectUnit, selectAllUnits,
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
    } else if (selectedPlayableRange) {
      player.playRegion(selectedPlayableRange.startTime, selectedPlayableRange.endTime, true);
    } else if (selectedUnit) {
      player.playRegion(selectedUnit.startTime, selectedUnit.endTime, true);
    } else {
      player.togglePlayback();
    }
  }, [player, selectedPlayableRange, subSelectionRange, selectedUnit]);

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
  /** Primary timeline unit id for prev/next/review navigation (unit or segment). */
  const navFocusUnitId = selectedTimelineUnit?.unitId?.trim() ? selectedTimelineUnit.unitId : '';

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
            if (markingModeRef.current) {
              selectTimelineUnit?.(null);
            }
            fireAndForget(createUnitFromSelection(s, end, {
              selectionBehavior: 'keep-current',
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
        runDeleteSelection(activeSelectionId, selectedUnitIds);
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
      selectAll:    () => { selectAllUnits(); },
      stepBack: () => {
        if (player.isPlaying) player.stop();
        player.seekBySeconds(-(1 / 25));
      },
      stepForward: () => {
        if (player.isPlaying) player.stop();
        player.seekBySeconds(1 / 25);
      },
      navPrev: (e) => {
        if (!navFocusUnitId) return;
        const idx = timelineUnitsOnCurrentMedia.findIndex((u) => u.id === navFocusUnitId);
        const target = timelineUnitsOnCurrentMedia[idx - 1];
        if (target) {
          manualSelectTsRef.current = Date.now();
          if (player.isPlaying) {
            player.stop();
          }
          selectUnit(target.id);
          const focusFrom = e.target instanceof HTMLElement ? e.target : null;
          const el = focusFrom?.closest('[tabindex]') as HTMLElement | null;
          if (el) requestAnimationFrame(() => el.focus());
        }
      },
      navNext: (e) => {
        if (!navFocusUnitId) return;
        const idx = timelineUnitsOnCurrentMedia.findIndex((u) => u.id === navFocusUnitId);
        const target = timelineUnitsOnCurrentMedia[idx + 1];
        if (target) {
          manualSelectTsRef.current = Date.now();
          if (player.isPlaying) {
            player.stop();
          }
          selectUnit(target.id);
          const focusFrom = e.target instanceof HTMLElement ? e.target : null;
          const el = focusFrom?.closest('[tabindex]') as HTMLElement | null;
          if (el) requestAnimationFrame(() => el.focus());
        }
      },
      tabNext: () => {
        if (!navFocusUnitId) return;
        const idx = timelineUnitsOnCurrentMedia.findIndex((u) => u.id === navFocusUnitId);
        const target = timelineUnitsOnCurrentMedia[idx + 1];
        if (target) {
          manualSelectTsRef.current = Date.now();
          selectUnit(target.id);
          if (player.isReady) player.playRegion(target.startTime, target.endTime);
        }
      },
      tabPrev: () => {
        if (!navFocusUnitId) return;
        const idx = timelineUnitsOnCurrentMedia.findIndex((u) => u.id === navFocusUnitId);
        const target = timelineUnitsOnCurrentMedia[idx - 1];
        if (target) {
          manualSelectTsRef.current = Date.now();
          selectUnit(target.id);
          if (player.isReady) player.playRegion(target.startTime, target.endTime);
        }
      },
      reviewNext: () => {
        // 跳到当前句段之后第一个低置信度句段（< 0.75）| Jump to next low-confidence unit after current
        const curIdx = navFocusUnitId
          ? timelineUnitsOnCurrentMedia.findIndex((u) => u.id === navFocusUnitId)
          : -1;
        const lowList = timelineUnitsOnCurrentMedia
          .map((u, i) => ({ u, i }))
          .filter(({ u }) => typeof u.ai_metadata?.confidence === 'number' && u.ai_metadata.confidence < 0.75);
        const target = lowList.find(({ i }) => i > curIdx);
        if (target) {
          manualSelectTsRef.current = Date.now();
          if (player.isPlaying) player.stop();
          selectUnit(target.u.id);
          if (player.isReady) player.playRegion(target.u.startTime, target.u.endTime);
        }
      },
      reviewPrev: () => {
        // 跳到当前句段之前最近一个低置信度句段（< 0.75）| Jump to prev low-confidence unit before current
        const curIdx = navFocusUnitId
          ? timelineUnitsOnCurrentMedia.findIndex((u) => u.id === navFocusUnitId)
          : timelineUnitsOnCurrentMedia.length;
        const lowList = timelineUnitsOnCurrentMedia
          .map((u, i) => ({ u, i }))
          .filter(({ u }) => typeof u.ai_metadata?.confidence === 'number' && u.ai_metadata.confidence < 0.75)
          .filter(({ i }) => i < curIdx);
        const target = lowList[lowList.length - 1];
        if (target) {
          manualSelectTsRef.current = Date.now();
          if (player.isPlaying) player.stop();
          selectUnit(target.u.id);
          if (player.isReady) player.playRegion(target.u.startTime, target.u.endTime);
        }
      },
    };
  }, [activeSelectionId, navFocusUnitId, handlePlayPauseAction, player, player.isReady, player.isPlaying, selectedMediaUrl, segMarkStart, subSelectionRange, selectedUnitIds, timelineUnitsOnCurrentMedia, createUnitFromSelection, runDeleteSelection, runMergePrev, runMergeNext, runSplitAtTime, runSelectBefore, runSelectAfter, selectAllUnits, selectUnit, selectTimelineUnit, manualSelectTsRef]);

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
      if (isEditableTarget(e.target)) return;
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

  // Navigate to prev/next unit from an inline input
  const navigateUnitFromInput = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, direction: 1 | -1) => {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
      const idx = timelineUnitsOnCurrentMedia.findIndex((u) => u.id === navFocusUnitId);
      if (idx < 0) return;
      const target = timelineUnitsOnCurrentMedia[idx + direction];
      if (target) {
        manualSelectTsRef.current = Date.now();
        selectUnit(target.id);
        if (player.isReady) player.playRegion(target.startTime, target.endTime);
      }
    },
    [timelineUnitsOnCurrentMedia, navFocusUnitId, selectUnit, player, manualSelectTsRef],
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

  // Auto-focus waveform when multiple units selected
  useEffect(() => {
    if (selectedUnitIds.size > 1) {
      waveformAreaRef.current?.focus();
    }
  }, [selectedUnitIds.size, waveformAreaRef]);

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
        const target = timelineUnitsOnCurrentMedia[idx - 1];
        if (!target) break;
        manualSelectTsRef.current = Date.now();
        if (player.isPlaying) player.stop();
        selectUnit(target.id);
        if (player.isReady) player.playRegion(target.startTime, target.endTime);
        break;
      }
      default: break;
    }
  }, [undo, redo, setShowSearch, toggleNotes, timelineUnitsOnCurrentMedia, selectUnit, player, manualSelectTsRef]);

  return {
    handlePlayPauseAction,
    handleGlobalPlayPauseAction,
    handleWaveformKeyDown,
    navigateUnitFromInput,
    executeAction,
  };
}
