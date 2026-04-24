import { useEffect, useRef } from 'react';

import type { ToastContextValue } from '../contexts/ToastContext';
import { createTimelineUnit } from '../hooks/transcriptionTypes';
import { getTranscriptionTextById } from '../hooks/transcriptionTextLookup';
import {
  hasTranscriptionDeepLinkSelectionPayload,
  readTranscriptionDeepLinkOptionalParams,
  rememberTranscriptionWorkspaceReturnHint,
  stripTranscriptionDeepLinkSearchParams,
} from '../utils/transcriptionUrlDeepLink';

type SetSearchParams = (updater: (prev: URLSearchParams) => URLSearchParams, options?: { replace?: boolean }) => void;
type DeepLinkUnitRow = { id: string; textId: string; mediaId?: string; layerId?: string };
type DeepLinkLayerRow = { id: string; textId: string };
type DeepLinkMediaRow = { id: string; textId: string };

interface UseReadyWorkspaceDeepLinkEffectsInput {
  searchParams: URLSearchParams;
  setSearchParams: SetSearchParams;
  setActiveTextId: (textId: string) => void;
  loadSnapshot: () => Promise<unknown>;
  showToast: ToastContextValue['showToast'];
  tfB: (key: string, opts?: Record<string, unknown>) => string;
  phase: string;
  units: DeepLinkUnitRow[];
  layers: DeepLinkLayerRow[];
  mediaItems: DeepLinkMediaRow[];
  selectedUnitMedia?: { id?: string };
  segmentsByLayer: Record<string, Array<{ id: string }> | undefined>;
  segmentsLoadComplete: boolean;
  selectTimelineUnit: (unit: ReturnType<typeof createTimelineUnit>) => void;
  setSelectedLayerId: (layerId: string) => void;
  setFocusedLayerRowId: (layerId: string) => void;
  setSelectedMediaId: (mediaId: string) => void;
  defaultTranscriptionLayerId?: string;
  selectedLayerId?: string;
  transcriptionLayers: Array<{ id: string }>;
  activeTextId?: string | null;
}

export function useReadyWorkspaceDeepLinkEffects(input: UseReadyWorkspaceDeepLinkEffectsInput) {
  const {
    searchParams,
    setSearchParams,
    setActiveTextId,
    loadSnapshot,
    showToast,
    tfB,
    phase,
    units,
    layers,
    mediaItems,
    selectedUnitMedia,
    segmentsByLayer,
    segmentsLoadComplete,
    selectTimelineUnit,
    setSelectedLayerId,
    setFocusedLayerRowId,
    setSelectedMediaId,
    defaultTranscriptionLayerId,
    selectedLayerId,
    transcriptionLayers,
    activeTextId,
  } = input;

  const urlTextIdApplyNonceRef = useRef(0);
  const pendingPostTextIdDeepLinkRef = useRef<ReturnType<typeof readTranscriptionDeepLinkOptionalParams> | null>(null);

  useEffect(() => {
    const raw = searchParams.get('textId')?.trim() ?? '';
    if (!raw) return;

    const optional = readTranscriptionDeepLinkOptionalParams(searchParams);
    const nonce = (urlTextIdApplyNonceRef.current += 1);
    void (async () => {
      const exists = await getTranscriptionTextById(raw);
      if (urlTextIdApplyNonceRef.current !== nonce) return;
      if (!exists) {
        pendingPostTextIdDeepLinkRef.current = null;
        setSearchParams((prev) => stripTranscriptionDeepLinkSearchParams(prev), { replace: true });
        showToast(tfB('transcription.toast.deepLinkTextNotFound', { textId: raw }), 'error', 3600);
        return;
      }
      setActiveTextId(raw);
      await loadSnapshot();
      if (urlTextIdApplyNonceRef.current !== nonce) return;
      pendingPostTextIdDeepLinkRef.current = hasTranscriptionDeepLinkSelectionPayload(optional)
        ? optional
        : null;
      setSearchParams((prev) => stripTranscriptionDeepLinkSearchParams(prev), { replace: true });
    })();
  }, [searchParams, setActiveTextId, loadSnapshot, setSearchParams, showToast, tfB]);

  useEffect(() => {
    const pending = pendingPostTextIdDeepLinkRef.current;
    if (!pending) return;
    if (phase !== 'ready') return;

    const projectTextId = units[0]?.textId?.trim() ?? '';
    if (!projectTextId) {
      pendingPostTextIdDeepLinkRef.current = null;
      return;
    }

    const mediaOk = (id: string) => {
      const t = id.trim();
      if (!t) return false;
      return mediaItems.some((m) => m.id === t && m.textId === projectTextId);
    };
    const layerOk = (id: string) => {
      const t = id.trim();
      if (!t) return false;
      return layers.some((l) => l.id === t && l.textId === projectTextId);
    };

    const requestedMediaValid = Boolean(pending.mediaId?.trim() && mediaOk(pending.mediaId!));
    if (requestedMediaValid) {
      const want = pending.mediaId!.trim();
      const cur = (selectedUnitMedia?.id ?? '').trim();
      if (cur !== want) {
        setSelectedMediaId(want);
        return;
      }
    }

    if (pending.layerId?.trim() && layerOk(pending.layerId)) {
      const lid = pending.layerId.trim();
      setSelectedLayerId(lid);
      setFocusedLayerRowId(lid);
    }

    if (pending.unitId?.trim()) {
      const unitTarget = pending.unitId.trim();
      if (pending.unitKind === 'segment') {
        if (!segmentsLoadComplete) return;
        let foundLayer: string | null = null;
        for (const [layerKey, segs] of Object.entries(segmentsByLayer)) {
          if (!Array.isArray(segs)) continue;
          if (segs.some((s) => s.id === unitTarget)) {
            foundLayer = layerKey;
            break;
          }
        }
        if (foundLayer) {
          selectTimelineUnit(createTimelineUnit(foundLayer, unitTarget, 'segment'));
        }
      } else {
        const row = units.find((u) => u.id === unitTarget && u.textId === projectTextId);
        if (row) {
          const rowMedia = row.mediaId?.trim() ?? '';
          if (!requestedMediaValid && rowMedia && mediaOk(rowMedia) && (selectedUnitMedia?.id ?? '').trim() !== rowMedia) {
            setSelectedMediaId(rowMedia);
            return;
          }
          let layerForUnit =
            pending.layerId?.trim() && layerOk(pending.layerId)
              ? pending.layerId.trim()
              : (row.layerId?.trim() || selectedLayerId?.trim() || defaultTranscriptionLayerId?.trim() || '');
          if (!layerForUnit || !layers.some((l) => l.id === layerForUnit)) {
            layerForUnit = defaultTranscriptionLayerId?.trim() || transcriptionLayers[0]?.id?.trim() || '';
          }
          if (layerForUnit) {
            selectTimelineUnit(createTimelineUnit(layerForUnit, row.id, 'unit'));
          }
        }
      }
    }

    pendingPostTextIdDeepLinkRef.current = null;
  }, [
    phase,
    units,
    layers,
    mediaItems,
    selectedUnitMedia,
    segmentsByLayer,
    segmentsLoadComplete,
    selectTimelineUnit,
    setSelectedLayerId,
    setFocusedLayerRowId,
    setSelectedMediaId,
    defaultTranscriptionLayerId,
    selectedLayerId,
    transcriptionLayers,
  ]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const tid = (activeTextId ?? units[0]?.textId ?? '').trim();
    if (!tid) return;
    const mid = selectedUnitMedia?.id?.trim();
    rememberTranscriptionWorkspaceReturnHint({
      textId: tid,
      ...(mid ? { mediaId: mid } : {}),
    });
  }, [phase, activeTextId, units, selectedUnitMedia?.id]);
}
