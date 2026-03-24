/**
 * LayerRailContext - Layer Rail Sidebar Context
 *
 * Provides delete-related props that are passed through LayerRailSidebar
 * to useLayerDeleteConfirm without being used by LayerRailSidebar itself.
 *
 * This eliminates prop drilling for:
 * - deletableLayers
 * - checkLayerHasContent
 * - deleteLayer
 * - deleteLayerWithoutConfirm
 */

import { createContext, useContext, useMemo } from 'react';
import type { TranslationLayerDocType } from '../db';

// ── Context Value Type ────────────────────────────────────────────────────────

export interface LayerRailContextValue {
  deletableLayers: TranslationLayerDocType[];
  checkLayerHasContent: (layerId: string) => Promise<number>;
  deleteLayer: (layerId: string, options?: { keepUtterances?: boolean }) => Promise<void>;
  deleteLayerWithoutConfirm: (layerId: string) => Promise<void>;
}

// ── Context Setup ─────────────────────────────────────────────────────────────

const LayerRailContext = createContext<LayerRailContextValue | null>(null);

const MISSING_PROVIDER_MESSAGE = 'LayerRailContext is missing. Use useLayerDeleteConfirmProps or wrap with LayerRailProvider.';

let hasLoggedMissingProvider = false;

function reportMissingProvider(): void {
  if (hasLoggedMissingProvider) return;
  hasLoggedMissingProvider = true;
  console.warn(MISSING_PROVIDER_MESSAGE);
}

export function resetLayerRailContextDiagnosticsForTests(): void {
  hasLoggedMissingProvider = false;
}

const fallbackLayerRailContext: LayerRailContextValue = {
  deletableLayers: [],
  checkLayerHasContent: async () => 0,
  deleteLayer: async () => {},
  deleteLayerWithoutConfirm: async () => {},
};

export function useLayerRailContextOrFallback(options: { warnOnMissing?: boolean } = {}): LayerRailContextValue {
  const ctx = useContext(LayerRailContext);
  if (!ctx) {
    if (options.warnOnMissing !== false) {
      reportMissingProvider();
    }
    return fallbackLayerRailContext;
  }
  return ctx;
}

export function useLayerRailContext(): LayerRailContextValue {
  return useLayerRailContextOrFallback({ warnOnMissing: true });
}

// ── Provider Props ────────────────────────────────────────────────────────────

interface LayerRailProviderProps {
  children: React.ReactNode;
  deletableLayers: TranslationLayerDocType[];
  checkLayerHasContent: (layerId: string) => Promise<number>;
  deleteLayer: (layerId: string, options?: { keepUtterances?: boolean }) => Promise<void>;
  deleteLayerWithoutConfirm: (layerId: string) => Promise<void>;
}

// ── Provider Implementation ───────────────────────────────────────────────────

export function LayerRailProvider({
  children,
  deletableLayers,
  checkLayerHasContent,
  deleteLayer,
  deleteLayerWithoutConfirm,
}: LayerRailProviderProps) {
  const value = useMemo<LayerRailContextValue>(() => ({
    deletableLayers,
    checkLayerHasContent,
    deleteLayer,
    deleteLayerWithoutConfirm,
  }), [deletableLayers, checkLayerHasContent, deleteLayer, deleteLayerWithoutConfirm]);

  return (
    <LayerRailContext.Provider value={value}>
      {children}
    </LayerRailContext.Provider>
  );
}
