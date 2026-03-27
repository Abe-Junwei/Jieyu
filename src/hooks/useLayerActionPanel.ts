import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayerConstraint } from '../db';

export type LayerActionPanelKind = 'speaker-management' | 'create-transcription' | 'create-translation' | 'delete' | null;

export interface UseLayerActionPanelInput {
  createLayer: (
    type: 'transcription' | 'translation',
    config: { languageId: string; alias?: string; constraint?: LayerConstraint },
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  deleteLayer: (layerId: string, options?: { keepUtterances?: boolean }) => Promise<void>;
  deleteLayerWithoutConfirm?: (layerId: string) => Promise<void>;
  checkLayerHasContent?: (layerId: string) => Promise<number>;
  deletableLayers: Array<{ id: string; layerType?: 'transcription' | 'translation' }>;
  focusedLayerRowId: string;
  isLayerRailCollapsed: boolean;
}

export function useLayerActionPanel({
  createLayer,
  deleteLayer,
  deleteLayerWithoutConfirm,
  checkLayerHasContent,
  deletableLayers,
  focusedLayerRowId,
  isLayerRailCollapsed,
}: UseLayerActionPanelInput) {
  const _deleteLayerWithoutConfirm = deleteLayerWithoutConfirm ?? (async () => {});
  const _checkLayerHasContent = checkLayerHasContent ?? (async () => 0);
  const [layerActionPanel, setLayerActionPanel] = useState<LayerActionPanelKind>(null);
  const layerActionRootRef = useRef<HTMLDivElement | null>(null);

  // ── Quick-create transcription form ──
  const [quickTranscriptionLangId, setQuickTranscriptionLangId] = useState('');
  const [quickTranscriptionCustomLang, setQuickTranscriptionCustomLang] = useState('');
  const [quickTranscriptionAlias, setQuickTranscriptionAlias] = useState('');
  const [quickTranscriptionConstraint, setQuickTranscriptionConstraint] = useState<LayerConstraint>('symbolic_association');

  // ── Quick-create translation form ──
  const [quickTranslationLangId, setQuickTranslationLangId] = useState('');
  const [quickTranslationCustomLang, setQuickTranslationCustomLang] = useState('');
  const [quickTranslationAlias, setQuickTranslationAlias] = useState('');
  const [quickTranslationModality, setQuickTranslationModality] = useState<'text' | 'audio' | 'mixed'>('text');
  const [quickTranslationConstraint, setQuickTranslationConstraint] = useState<LayerConstraint>('symbolic_association');

  // ── Quick-delete form ──
  const [quickDeleteLayerId, setQuickDeleteLayerId] = useState('');
  const [quickDeleteKeepUtterances, setQuickDeleteKeepUtterances] = useState(false);

  // ── Handlers ──

  const handleCreateTranscriptionFromPanel = useCallback(async () => {
    const languageId = (quickTranscriptionLangId === '__custom__' ? quickTranscriptionCustomLang : quickTranscriptionLangId).trim();
    const alias = quickTranscriptionAlias.trim();
    const hasExistingTranscriptionLayer = deletableLayers.some((layer) => layer.layerType === 'transcription');
    const success = await createLayer('transcription', {
      languageId,
      ...(alias ? { alias } : {}),
      ...(hasExistingTranscriptionLayer ? { constraint: quickTranscriptionConstraint } : {}),
    });
    if (success) {
      setLayerActionPanel(null);
      setQuickTranscriptionLangId('');
      setQuickTranscriptionCustomLang('');
      setQuickTranscriptionAlias('');
      setQuickTranscriptionConstraint('symbolic_association');
    }
  }, [createLayer, deletableLayers, quickTranscriptionAlias, quickTranscriptionConstraint, quickTranscriptionCustomLang, quickTranscriptionLangId]);

  const handleCreateTranslationFromPanel = useCallback(async () => {
    const languageId = (quickTranslationLangId === '__custom__' ? quickTranslationCustomLang : quickTranslationLangId).trim();
    const alias = quickTranslationAlias.trim();
    const success = await createLayer('translation', {
      languageId,
      ...(alias ? { alias } : {}),
      constraint: quickTranslationConstraint,
    }, quickTranslationModality);
    if (success) {
      setLayerActionPanel(null);
      setQuickTranslationLangId('');
      setQuickTranslationCustomLang('');
      setQuickTranslationAlias('');
      setQuickTranslationModality('text');
      setQuickTranslationConstraint('symbolic_association');
    }
  }, [createLayer, quickTranslationAlias, quickTranslationConstraint, quickTranslationCustomLang, quickTranslationLangId, quickTranslationModality]);

  const canConfigureTranscriptionConstraint = deletableLayers.some((layer) => layer.layerType === 'transcription');

  const handleDeleteLayerFromPanel = useCallback(async () => {
    if (!quickDeleteLayerId) return;
    await deleteLayer(quickDeleteLayerId, { keepUtterances: quickDeleteKeepUtterances });
    setLayerActionPanel(null);
    setQuickDeleteKeepUtterances(false);
  }, [deleteLayer, quickDeleteKeepUtterances, quickDeleteLayerId]);

  // ── Effects ──

  // Sync quickDeleteLayerId with available deletable layers.
  useEffect(() => {
    if (!deletableLayers.length) {
      setQuickDeleteLayerId('');
      return;
    }
    const exists = deletableLayers.some((l) => l.id === quickDeleteLayerId);
    if (exists) return;
    const focused = focusedLayerRowId
      ? deletableLayers.find((l) => l.id === focusedLayerRowId)
      : undefined;
    setQuickDeleteLayerId(focused?.id ?? deletableLayers[0]!.id);
  }, [deletableLayers, focusedLayerRowId, quickDeleteLayerId]);

  // Close panel when layer rail collapses.
  useEffect(() => {
    if (isLayerRailCollapsed) setLayerActionPanel(null);
  }, [isLayerRailCollapsed]);

  // Click-outside & Escape dismiss.
  useEffect(() => {
    if (!layerActionPanel) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (layerActionRootRef.current?.contains(target)) return;
      setLayerActionPanel(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLayerActionPanel(null);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [layerActionPanel]);

  return {
    layerActionPanel,
    setLayerActionPanel,
    layerActionRootRef,
    // Transcription form
    quickTranscriptionLangId,
    setQuickTranscriptionLangId,
    quickTranscriptionCustomLang,
    setQuickTranscriptionCustomLang,
    quickTranscriptionAlias,
    setQuickTranscriptionAlias,
    quickTranscriptionConstraint,
    setQuickTranscriptionConstraint,
    canConfigureTranscriptionConstraint,
    // Translation form
    quickTranslationLangId,
    setQuickTranslationLangId,
    quickTranslationCustomLang,
    setQuickTranslationCustomLang,
    quickTranslationAlias,
    setQuickTranslationAlias,
    quickTranslationModality,
    setQuickTranslationModality,
    quickTranslationConstraint,
    setQuickTranslationConstraint,
    // Delete form
    quickDeleteLayerId,
    setQuickDeleteLayerId,
    quickDeleteKeepUtterances,
    setQuickDeleteKeepUtterances,
    // Handlers
    handleCreateTranscriptionFromPanel,
    handleCreateTranslationFromPanel,
    handleDeleteLayerFromPanel,
    // Direct access for context menu
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm: _deleteLayerWithoutConfirm,
    checkLayerHasContent: _checkLayerHasContent,
  };
}
