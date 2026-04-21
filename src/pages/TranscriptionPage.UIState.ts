/**
 * TranscriptionPage - UI State Hook
 * 提取自 TranscriptionPage.tsx 的 UI 状态管理
 */

import { useCallback, useState } from 'react';
import type { TimelineUnitKind } from '../hooks/transcriptionTypes';

/** 左右对照视图焦点（组 + 子项 + 译文侧菜单锚点），由 ReadyWorkspace 持有以便与波形/便签协同 */
export interface TranscriptionVerticalPaneFocusState {
  activeVerticalReadingGroupId: string | null;
  activeVerticalReadingCellId: string | null;
  pairedReadingTargetSide: 'source' | 'target' | null;
  /** 译文列右键菜单所锚定的左列单元；合并组内未点左列时为 null，回落 primary */
  contextMenuSourceUnitId: string | null;
}

export const DEFAULT_TRANSCRIPTION_VERTICAL_PANE_FOCUS: TranscriptionVerticalPaneFocusState = {
  activeVerticalReadingGroupId: null,
  activeVerticalReadingCellId: null,
  pairedReadingTargetSide: null,
  contextMenuSourceUnitId: null,
};

/** 右键打开全局语段菜单时的 UI 情境（与 note 的 timeline/waveform scope 独立） */
export type TranscriptionCtxMenuSurface = 'timeline-annotation' | 'waveform-region';

export type TranscriptionCtxMenuLayerType = 'transcription' | 'translation';

// ── Context Menu Types ─────────────────────────────────────────────────────────

export interface ContextMenuState {
  x: number;
  y: number;
  unitId: string;
  layerId: string;
  unitKind: TimelineUnitKind;
  splitTime: number;
  /** 备注 tier 等仍沿用历史字段 | Note tier scope */
  source?: 'timeline' | 'waveform';
  menuSurface: TranscriptionCtxMenuSurface;
  layerType: TranscriptionCtxMenuLayerType;
}

export interface UttOpsMenuState {
  x: number;
  y: number;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useTranscriptionUIState() {
  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [uttOpsMenu, setUttOpsMenu] = useState<UttOpsMenuState | null>(null);
  const [showBatchOperationPanel, setShowBatchOperationPanel] = useState(false);
  const [verticalPaneFocus, setVerticalPaneFocusState] = useState<TranscriptionVerticalPaneFocusState>(
    () => ({ ...DEFAULT_TRANSCRIPTION_VERTICAL_PANE_FOCUS }),
  );

  const updateVerticalPaneFocus = useCallback((patch: Partial<TranscriptionVerticalPaneFocusState>) => {
    setVerticalPaneFocusState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetVerticalPaneFocus = useCallback(() => {
    setVerticalPaneFocusState({ ...DEFAULT_TRANSCRIPTION_VERTICAL_PANE_FOCUS });
  }, []);

  return {
    ctxMenu,
    setCtxMenu,
    uttOpsMenu,
    setUttOpsMenu,
    showBatchOperationPanel,
    setShowBatchOperationPanel,
    verticalPaneFocus,
    updateVerticalPaneFocus,
    resetVerticalPaneFocus,
  };
}
