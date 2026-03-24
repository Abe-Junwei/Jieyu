import { useState } from 'react';
import type {
  AnchorDocType,
  LayerLinkDocType,
  MediaItemDocType,
  SpeakerDocType,
  TranslationLayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';

export function useTranscriptionDocumentState() {
  const [utterances, setUtterances] = useState<UtteranceDocType[]>([]);
  const [anchors, setAnchors] = useState<AnchorDocType[]>([]);
  const [translations, setTranslations] = useState<UtteranceTextDocType[]>([]);
  const [layers, setLayers] = useState<TranslationLayerDocType[]>([]);
  const [layerLinks, setLayerLinks] = useState<LayerLinkDocType[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItemDocType[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerDocType[]>([]);
  const [utteranceDrafts, setUtteranceDrafts] = useState<Record<string, string>>({});
  const [translationDrafts, setTranslationDrafts] = useState<Record<string, string>>({});

  return {
    utterances,
    setUtterances,
    anchors,
    setAnchors,
    translations,
    setTranslations,
    layers,
    setLayers,
    layerLinks,
    setLayerLinks,
    mediaItems,
    setMediaItems,
    speakers,
    setSpeakers,
    utteranceDrafts,
    setUtteranceDrafts,
    translationDrafts,
    setTranslationDrafts,
  };
}
