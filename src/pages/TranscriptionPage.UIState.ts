/**
 * TranscriptionPage - UI State Hook
 * 提取自 TranscriptionPage.tsx 的 UI 状态管理
 */

import { useState } from 'react';

// ── Context Menu Types ─────────────────────────────────────────────────────────

export interface ContextMenuState {
  x: number;
  y: number;
  utteranceId: string;
  layerId: string;
  splitTime: number;
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

  return {
    ctxMenu,
    setCtxMenu,
    uttOpsMenu,
    setUttOpsMenu,
    showBatchOperationPanel,
    setShowBatchOperationPanel,
  };
}
