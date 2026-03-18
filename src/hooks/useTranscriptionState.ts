import { useRef, useState } from 'react';
import type {
  AnchorDocType,
  LayerLinkDocType,
  MediaItemDocType,
  TranslationLayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../../db';
import { useLatest } from './useLatest';
import type { DbState, SaveState, SnapGuide } from './transcriptionTypes';

export function useTranscriptionState() {
  const [state, setState] = useState<DbState>({ phase: 'loading' });
  const [utterances, setUtterances] = useState<UtteranceDocType[]>([]);
  const [anchors, setAnchors] = useState<AnchorDocType[]>([]);
  const [layers, setLayers] = useState<TranslationLayerDocType[]>([]);
  const [translations, setTranslations] = useState<UtteranceTextDocType[]>([]);
  const [layerLinks, setLayerLinks] = useState<LayerLinkDocType[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItemDocType[]>([]);
  const [selectedUtteranceId, setSelectedUtteranceId] = useState<string>('');
  const [selectedUtteranceIds, setSelectedUtteranceIds] = useState<Set<string>>(new Set());
  const [selectedMediaId, setSelectedMediaId] = useState<string>('');
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');

  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [layerCreateMessage, setLayerCreateMessage] = useState('');
  const [utteranceDrafts, setUtteranceDrafts] = useState<Record<string, string>>({});
  const [translationDrafts, setTranslationDrafts] = useState<Record<string, string>>({});
  const [snapGuide, setSnapGuide] = useState<SnapGuide>({ visible: false });
  const [layerToDeleteId, setLayerToDeleteId] = useState('');
  const [showLayerManager, setShowLayerManager] = useState(false);

  const autoSaveTimersRef = useRef<Record<string, number>>({});
  const focusedTranslationDraftKeyRef = useRef<string | null>(null);

  const utterancesRef = useLatest(utterances);
  const anchorsRef = useLatest(anchors);
  const translationsRef = useLatest(translations);
  const layersRef = useLatest(layers);
  const layerLinksRef = useLatest(layerLinks);
  const selectedUtteranceIdRef = useLatest(selectedUtteranceId);
  const selectedUtteranceIdsRef = useLatest(selectedUtteranceIds);

  return {
    state,
    setState,
    utterances,
    setUtterances,
    anchors,
    setAnchors,
    layers,
    setLayers,
    translations,
    setTranslations,
    layerLinks,
    setLayerLinks,
    mediaItems,
    setMediaItems,
    selectedUtteranceId,
    setSelectedUtteranceId,
    selectedUtteranceIds,
    setSelectedUtteranceIds,
    selectedMediaId,
    setSelectedMediaId,
    selectedLayerId,
    setSelectedLayerId,
    saveState,
    setSaveState,
    layerCreateMessage,
    setLayerCreateMessage,
    utteranceDrafts,
    setUtteranceDrafts,
    translationDrafts,
    setTranslationDrafts,
    snapGuide,
    setSnapGuide,
    layerToDeleteId,
    setLayerToDeleteId,
    showLayerManager,
    setShowLayerManager,
    autoSaveTimersRef,
    focusedTranslationDraftKeyRef,
    utterancesRef,
    anchorsRef,
    translationsRef,
    layersRef,
    layerLinksRef,
    selectedUtteranceIdRef,
    selectedUtteranceIdsRef,
  };
}
