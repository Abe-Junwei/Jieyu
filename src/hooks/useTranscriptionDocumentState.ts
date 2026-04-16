import { useState } from 'react';
import type { AnchorDocType, LayerLinkDocType, MediaItemDocType, SpeakerDocType, LayerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';

export function useTranscriptionDocumentState() {
  const [units, setUnits] = useState<LayerUnitDocType[]>([]);
  const [anchors, setAnchors] = useState<AnchorDocType[]>([]);
  const [translations, setTranslations] = useState<LayerUnitContentDocType[]>([]);
  const [layers, setLayers] = useState<LayerDocType[]>([]);
  const [layerLinks, setLayerLinks] = useState<LayerLinkDocType[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItemDocType[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerDocType[]>([]);
  const [unitDrafts, setUnitDrafts] = useState<Record<string, string>>({});
  const [translationDrafts, setTranslationDrafts] = useState<Record<string, string>>({});

  return {
    units,
    setUnits,
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
    unitDrafts,
    setUnitDrafts,
    translationDrafts,
    setTranslationDrafts,
  };
}
