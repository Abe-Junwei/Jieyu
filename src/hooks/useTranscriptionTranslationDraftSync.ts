import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  TranslationLayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';

type Params = {
  translationLayers: TranslationLayerDocType[];
  utterancesOnCurrentMedia: UtteranceDocType[];
  translationTextByLayer: Map<string, Map<string, UtteranceTextDocType>>;
  setTranslationDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  focusedTranslationDraftKeyRef: MutableRefObject<string | null>;
};

export function useTranscriptionTranslationDraftSync({
  translationLayers,
  utterancesOnCurrentMedia,
  translationTextByLayer,
  setTranslationDrafts,
  focusedTranslationDraftKeyRef,
}: Params) {
  useEffect(() => {
    const next: Record<string, string> = {};
    translationLayers.forEach((layer) => {
      utterancesOnCurrentMedia.forEach((item) => {
        next[`${layer.id}-${item.id}`] = translationTextByLayer.get(layer.id)?.get(item.id)?.text ?? '';
      });
    });
    setTranslationDrafts((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      // Fast path: nothing changed
      if (prevKeys.length === nextKeys.length && nextKeys.every((k) => prev[k] === next[k])) {
        return prev;
      }
      // Preserve user's in-progress edit (the currently focused input)
      const focusedKey = focusedTranslationDraftKeyRef.current;
      if (focusedKey && focusedKey in prev) {
        next[focusedKey] = prev[focusedKey]!;
      }
      return next;
    });
  }, [focusedTranslationDraftKeyRef, setTranslationDrafts, translationLayers, translationTextByLayer, utterancesOnCurrentMedia]);
}