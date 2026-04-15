import { useCallback } from 'react';
import { getDb } from '../db';
import type {
  AnchorDocType,
  LayerLinkDocType,
  MediaItemDocType,
  SpeakerDocType,
  LayerDocType,
  UtteranceDocType,
  UtteranceMorphemeDocType,
  UtteranceTextDocType,
  UtteranceTokenDocType,
} from '../db';
import { mergedTimelineUnitSemanticKeyCount } from './timelineUnitView';
import { listUtteranceTextsFromSegmentation } from '../services/LayerSegmentationTextService';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';
import { listUtteranceDocsFromCanonicalLayerUnits } from '../services/LayerSegmentGraphService';
import { createTimelineUnit, type DbState, type TimelineUnit } from './transcriptionTypes';

type Params = {
  dbNameRef: React.MutableRefObject<string | undefined>;
  setAnchors: React.Dispatch<React.SetStateAction<AnchorDocType[]>>;
  setLayerLinks: React.Dispatch<React.SetStateAction<LayerLinkDocType[]>>;
  setLayers: React.Dispatch<React.SetStateAction<LayerDocType[]>>;
  setMediaItems: React.Dispatch<React.SetStateAction<MediaItemDocType[]>>;
  setSpeakers: React.Dispatch<React.SetStateAction<SpeakerDocType[]>>;
  setSelectedLayerId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedUnitIds?: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedTimelineUnit?: React.Dispatch<React.SetStateAction<TimelineUnit | null>>;
  setState: React.Dispatch<React.SetStateAction<DbState>>;
  setTranslations: React.Dispatch<React.SetStateAction<UtteranceTextDocType[]>>;
  setUtteranceDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setUtterances: React.Dispatch<React.SetStateAction<UtteranceDocType[]>>;
};

export function useTranscriptionSnapshotLoader({
  dbNameRef,
  setAnchors,
  setLayerLinks,
  setLayers,
  setMediaItems,
  setSpeakers,
  setSelectedLayerId,
  setSelectedUnitIds,
  setSelectedTimelineUnit,
  setState,
  setTranslations,
  setUtteranceDrafts,
  setUtterances,
}: Params) {
  const loadSnapshot = useCallback(async () => {
    const db = await getDb();
    const [
      utteranceRowsRaw,
      anchorDocs,
      layerDocs,
      mediaDocs,
      speakerDocs,
      linkDocs,
      tokenDocs,
      morphemeDocs,
    ] = await Promise.all([
      listUtteranceDocsFromCanonicalLayerUnits(db),
      db.collections.anchors.find().exec(),
      db.collections.layers.find().exec(),
      db.collections.media_items.find().exec(),
      db.collections.speakers.find().exec(),
      db.collections.layer_links.find().exec(),
      db.collections.utterance_tokens.find().exec(),
      db.collections.utterance_morphemes.find().exec(),
    ]);
    const anchorRows = anchorDocs.map((doc) => doc.toJSON() as unknown as AnchorDocType);
    const allLayerRows = layerDocs.map((doc) => doc.toJSON() as unknown as LayerDocType);
    const translationRows = await listUtteranceTextsFromSegmentation(db);
    const mediaRows = mediaDocs.map((doc) => doc.toJSON() as unknown as MediaItemDocType);
      const speakerRows = speakerDocs.map((doc) => doc.toJSON() as unknown as SpeakerDocType);
    const linkRows = linkDocs.map((doc) => doc.toJSON() as unknown as LayerLinkDocType);
    const tokenRows = tokenDocs
      .map((doc) => doc.toJSON() as unknown as UtteranceTokenDocType)
      .sort((a, b) => {
        if (a.unitId === b.unitId) return a.tokenIndex - b.tokenIndex;
        return a.unitId.localeCompare(b.unitId);
      });
    const morphemeRows = morphemeDocs
      .map((doc) => doc.toJSON() as unknown as UtteranceMorphemeDocType)
      .sort((a, b) => {
        if (a.tokenId === b.tokenId) return a.morphemeIndex - b.morphemeIndex;
        return a.tokenId.localeCompare(b.tokenId);
      });

    const tokensByUtterance = new Map<string, UtteranceTokenDocType[]>();
    tokenRows.forEach((token) => {
      const list = tokensByUtterance.get(token.unitId) ?? [];
      list.push(token);
      tokensByUtterance.set(token.unitId, list);
    });
    const morphemesByToken = new Map<string, UtteranceMorphemeDocType[]>();
    morphemeRows.forEach((morpheme) => {
      const list = morphemesByToken.get(morpheme.tokenId) ?? [];
      list.push(morpheme);
      morphemesByToken.set(morpheme.tokenId, list);
    });

    const utteranceRows = utteranceRowsRaw.map((row) => {
      const canonicalTokens = tokensByUtterance.get(row.id);
      if (!canonicalTokens || canonicalTokens.length === 0) {
        return row;
      }

      const words = canonicalTokens.map((token) => {
        const canonicalMorphemes = morphemesByToken.get(token.id) ?? [];
        return {
          id: token.id,
          form: token.form,
          ...(token.gloss ? { gloss: token.gloss } : {}),
          ...(token.pos ? { pos: token.pos } : {}),
          ...(token.lexemeId ? { lexemeId: token.lexemeId } : {}),
          ...(token.provenance ? { provenance: token.provenance } : {}),
          ...(canonicalMorphemes.length > 0
            ? {
                morphemes: canonicalMorphemes.map((morph) => ({
                  id: morph.id,
                  form: morph.form,
                  ...(morph.gloss ? { gloss: morph.gloss } : {}),
                  ...(morph.pos ? { pos: morph.pos } : {}),
                  ...(morph.lexemeId ? { lexemeId: morph.lexemeId } : {}),
                  ...(morph.provenance ? { provenance: morph.provenance } : {}),
                })),
              }
            : {}),
        };
      });

      return {
        ...row,
        words,
      };
    });

    const activeTextId = utteranceRows[0]?.textId;
    const layerRows = activeTextId
      ? allLayerRows.filter((l) => l.textId === activeTextId)
      : allLayerRows;

    setUtterances(utteranceRows);
    setAnchors(anchorRows);
    setLayers(layerRows);
    setTranslations(translationRows);
    setMediaItems(mediaRows);
    setSpeakers(speakerRows);
    setLayerLinks(linkRows);
    setUtteranceDrafts(() => {
      const next: Record<string, string> = {};
      utteranceRows.forEach((row) => {
        const defaultTrcLayer = layerRows.find((l) => l.layerType === 'transcription' && l.isDefault)
          ?? layerRows.find((l) => l.layerType === 'transcription');
        if (defaultTrcLayer) {
          const tr = translationRows.find(
            (t) => t.utteranceId === row.id && t.layerId === defaultTrcLayer.id,
          );
          next[row.id] = tr?.text ?? '';
        } else {
          next[row.id] = row.transcription?.default ?? '';
        }
      });
      return next;
    });

    const effectiveSelectedUtteranceId = utteranceRows[0]?.id || '';
    const initialSelectedLayerId = layerRows.find((item) => item.layerType === 'translation')?.id
      ?? layerRows.find((item) => item.layerType === 'transcription')?.id
      ?? '';
    setSelectedUnitIds?.(effectiveSelectedUtteranceId ? new Set([effectiveSelectedUtteranceId]) : new Set());
    setSelectedTimelineUnit?.(effectiveSelectedUtteranceId
      ? createTimelineUnit(initialSelectedLayerId, effectiveSelectedUtteranceId, 'utterance')
      : null);
    setSelectedLayerId((prev) => {
      if (!prev) {
        if (initialSelectedLayerId) return initialSelectedLayerId;
      }
      return prev;
    });

    dbNameRef.current = db.name;
    const translationLayerRows = layerRows.filter((l) => l.layerType === 'translation');
    const projectTextId = utteranceRows[0]?.textId ?? layerRows[0]?.textId ?? '';
    let unitCount = utteranceRows.length;
    if (projectTextId.trim()) {
      const projectSegments = await LayerSegmentQueryService.listSegmentsByTextId(projectTextId);
      unitCount = mergedTimelineUnitSemanticKeyCount({
        utteranceIds: utteranceRows.map((row) => row.id),
        segments: projectSegments,
      });
    }

    setState({
      phase: 'ready',
      dbName: db.name,
      unitCount,
      translationLayerCount: translationLayerRows.length,
      translationRecordCount: translationRows.length,
    });
  }, [
    dbNameRef,
    setAnchors,
    setLayerLinks,
    setLayers,
    setMediaItems,
    setSpeakers,
    setSelectedLayerId,
    setSelectedUnitIds,
    setSelectedTimelineUnit,
    setState,
    setTranslations,
    setUtteranceDrafts,
    setUtterances,
  ]);

  return {
    loadSnapshot,
  };
}