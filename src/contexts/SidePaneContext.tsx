/**
 * SidePaneLayerContext - Side Pane Layer Sidebar Context
 *
 * Provides delete-related props that are passed through SidePaneSidebar
 * to useLayerDeleteConfirm without being used by SidePaneSidebar itself.
 *
 * This eliminates prop drilling for:
 * - deletableLayers
 * - checkLayerHasContent
 * - deleteLayer
 * - deleteLayerWithoutConfirm
 */

import { createContext, useContext, useMemo } from 'react';
import type { LayerDocType } from '../db';

// ── Context Value Type ────────────────────────────────────────────────────────

export interface SidePaneLayerContextValue {
  deletableLayers: LayerDocType[];
  checkLayerHasContent: (layerId: string) => Promise<number>;
  deleteLayer: (layerId: string, options?: { keepUtterances?: boolean }) => Promise<void>;
  deleteLayerWithoutConfirm: (layerId: string) => Promise<void>;
}

// ── Context Setup ─────────────────────────────────────────────────────────────

const SidePaneLayerContext = createContext<SidePaneLayerContextValue | null>(null);

const MISSING_PROVIDER_MESSAGE = 'SidePaneLayerContext is missing. Use useLayerDeleteConfirmProps or wrap with SidePaneLayerProvider.';

let hasLoggedMissingProvider = false;

function reportMissingProvider(): void {
  if (hasLoggedMissingProvider) return;
  hasLoggedMissingProvider = true;
  console.warn(MISSING_PROVIDER_MESSAGE);
}

export function resetSidePaneLayerContextDiagnosticsForTests(): void {
  hasLoggedMissingProvider = false;
}

const fallbackSidePaneLayerContext: SidePaneLayerContextValue = {
  deletableLayers: [],
  checkLayerHasContent: async () => 0,
  deleteLayer: async () => {},
  deleteLayerWithoutConfirm: async () => {},
};

export function useSidePaneLayerContextOrFallback(options: { warnOnMissing?: boolean } = {}): SidePaneLayerContextValue {
  const ctx = useContext(SidePaneLayerContext);
  if (!ctx) {
    if (options.warnOnMissing !== false) {
      reportMissingProvider();
    }
    return fallbackSidePaneLayerContext;
  }
  return ctx;
}

export function useSidePaneLayerContext(): SidePaneLayerContextValue {
  return useSidePaneLayerContextOrFallback({ warnOnMissing: true });
}

// ── Provider Props ────────────────────────────────────────────────────────────

interface SidePaneLayerProviderProps {
  children: React.ReactNode;
  deletableLayers: LayerDocType[];
  checkLayerHasContent: (layerId: string) => Promise<number>;
  deleteLayer: (layerId: string, options?: { keepUtterances?: boolean }) => Promise<void>;
  deleteLayerWithoutConfirm: (layerId: string) => Promise<void>;
}

// ── Provider Implementation ───────────────────────────────────────────────────

export function SidePaneLayerProvider({
  children,
  deletableLayers,
  checkLayerHasContent,
  deleteLayer,
  deleteLayerWithoutConfirm,
}: SidePaneLayerProviderProps) {
  const value = useMemo<SidePaneLayerContextValue>(() => ({
    deletableLayers,
    checkLayerHasContent,
    deleteLayer,
    deleteLayerWithoutConfirm,
  }), [deletableLayers, checkLayerHasContent, deleteLayer, deleteLayerWithoutConfirm]);

  return (
    <SidePaneLayerContext.Provider value={value}>
      {children}
    </SidePaneLayerContext.Provider>
  );
}
