import { useCallback, useEffect, useRef, useState } from 'react';

export type LayerActionPanelKind = 'create-transcription' | 'create-translation' | 'delete' | null;

export interface UseLayerActionPanelInput {
  createLayer: (
    type: 'transcription' | 'translation',
    config: { languageId: string; alias?: string },
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  deleteLayer: (layerId: string) => Promise<void>;
  deletableLayers: Array<{ id: string }>;
  focusedLayerRowId: string;
  isLayerRailCollapsed: boolean;
}

export function useLayerActionPanel({
  createLayer,
  deleteLayer,
  deletableLayers,
  focusedLayerRowId,
  isLayerRailCollapsed,
}: UseLayerActionPanelInput) {
  const [layerActionPanel, setLayerActionPanel] = useState<LayerActionPanelKind>(null);
  const layerActionRootRef = useRef<HTMLDivElement | null>(null);

  // ── Quick-create transcription form ──
  const [quickTranscriptionLangId, setQuickTranscriptionLangId] = useState('');
  const [quickTranscriptionCustomLang, setQuickTranscriptionCustomLang] = useState('');
  const [quickTranscriptionAlias, setQuickTranscriptionAlias] = useState('');

  // ── Quick-create translation form ──
  const [quickTranslationLangId, setQuickTranslationLangId] = useState('');
  const [quickTranslationCustomLang, setQuickTranslationCustomLang] = useState('');
  const [quickTranslationAlias, setQuickTranslationAlias] = useState('');
  const [quickTranslationModality, setQuickTranslationModality] = useState<'text' | 'audio' | 'mixed'>('text');

  // ── Quick-delete form ──
  const [quickDeleteLayerId, setQuickDeleteLayerId] = useState('');

  // ── Handlers ──

  const handleCreateTranscriptionFromPanel = useCallback(async () => {
    const languageId = (quickTranscriptionLangId === '__custom__' ? quickTranscriptionCustomLang : quickTranscriptionLangId).trim();
    const alias = quickTranscriptionAlias.trim();
    const success = await createLayer('transcription', {
      languageId,
      ...(alias ? { alias } : {}),
    });
    if (success) {
      setLayerActionPanel(null);
      setQuickTranscriptionLangId('');
      setQuickTranscriptionCustomLang('');
      setQuickTranscriptionAlias('');
    }
  }, [createLayer, quickTranscriptionAlias, quickTranscriptionCustomLang, quickTranscriptionLangId]);

  const handleCreateTranslationFromPanel = useCallback(async () => {
    const languageId = (quickTranslationLangId === '__custom__' ? quickTranslationCustomLang : quickTranslationLangId).trim();
    const alias = quickTranslationAlias.trim();
    const success = await createLayer('translation', {
      languageId,
      ...(alias ? { alias } : {}),
    }, quickTranslationModality);
    if (success) {
      setLayerActionPanel(null);
      setQuickTranslationLangId('');
      setQuickTranslationCustomLang('');
      setQuickTranslationAlias('');
      setQuickTranslationModality('text');
    }
  }, [createLayer, quickTranslationAlias, quickTranslationCustomLang, quickTranslationLangId, quickTranslationModality]);

  const handleDeleteLayerFromPanel = useCallback(async () => {
    if (!quickDeleteLayerId) return;
    await deleteLayer(quickDeleteLayerId);
    setLayerActionPanel(null);
  }, [deleteLayer, quickDeleteLayerId]);

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
    // Translation form
    quickTranslationLangId,
    setQuickTranslationLangId,
    quickTranslationCustomLang,
    setQuickTranslationCustomLang,
    quickTranslationAlias,
    setQuickTranslationAlias,
    quickTranslationModality,
    setQuickTranslationModality,
    // Delete form
    quickDeleteLayerId,
    setQuickDeleteLayerId,
    // Handlers
    handleCreateTranscriptionFromPanel,
    handleCreateTranslationFromPanel,
    handleDeleteLayerFromPanel,
    // Direct access for context menu
    createLayer,
    deleteLayer,
  };
}
