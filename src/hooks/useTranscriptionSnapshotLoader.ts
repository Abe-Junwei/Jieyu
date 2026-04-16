import { useCallback } from 'react';
import { getDb } from '../db';
import type { AnchorDocType, LayerLinkDocType, MediaItemDocType, SpeakerDocType, LayerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import type { UnitMorphemeDocType, UnitTokenDocType } from '../db';
import { mergedTimelineUnitSemanticKeyCount } from './timelineUnitView';
import { listUnitTextsFromSegmentation } from '../services/LayerSegmentationTextService';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';
import { listUnitDocsFromCanonicalLayerUnits } from '../services/LayerSegmentGraphService';
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
  setTranslations: React.Dispatch<React.SetStateAction<LayerUnitContentDocType[]>>;
  setUnitDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setUnits: React.Dispatch<React.SetStateAction<LayerUnitDocType[]>>;
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
  setUnitDrafts,
  setUnits,
}: Params) {
  const loadSnapshot = useCallback(async () => {
    const db = await getDb();
    const [
      unitRowsRaw,
      anchorDocs,
      layerDocs,
      mediaDocs,
      speakerDocs,
      linkDocs,
    ] = await Promise.all([
      listUnitDocsFromCanonicalLayerUnits(db),
      db.collections.anchors.find().exec(),
      db.collections.layers.find().exec(),
      db.collections.media_items.find().exec(),
      db.collections.speakers.find().exec(),
      db.collections.layer_links.find().exec(),
    ]);
    const anchorRows = anchorDocs.map((doc) => doc.toJSON() as unknown as AnchorDocType);
    const allLayerRows = layerDocs.map((doc) => doc.toJSON() as unknown as LayerDocType);
    const translationRows = await listUnitTextsFromSegmentation(db);
    const mediaRows = mediaDocs.map((doc) => doc.toJSON() as unknown as MediaItemDocType);
      const speakerRows = speakerDocs.map((doc) => doc.toJSON() as unknown as SpeakerDocType);
    const linkRows = linkDocs.map((doc) => doc.toJSON() as unknown as LayerLinkDocType);

    // token/morpheme 延迟加载，不阻塞首屏 | Deferred to loadLinguisticAnnotations
    const unitRows = unitRowsRaw;

    const activeTextId = unitRows[0]?.textId;
    const layerRows = activeTextId
      ? allLayerRows.filter((l) => l.textId === activeTextId)
      : allLayerRows;

    setUnits(unitRows);
    setAnchors(anchorRows);
    setLayers(layerRows);
    setTranslations(translationRows);
    setMediaItems(mediaRows);
    setSpeakers(speakerRows);
    setLayerLinks(linkRows);
    setUnitDrafts(() => {
      const next: Record<string, string> = {};
      unitRows.forEach((row) => {
        const defaultTrcLayer = layerRows.find((l) => l.layerType === 'transcription' && l.isDefault)
          ?? layerRows.find((l) => l.layerType === 'transcription');
        if (defaultTrcLayer) {
          const tr = translationRows.find(
            (t) => t.unitId === row.id && t.layerId === defaultTrcLayer.id,
          );
          next[row.id] = tr?.text ?? '';
        } else {
          next[row.id] = row.transcription?.default ?? '';
        }
      });
      return next;
    });

    const effectiveSelectedUnitId = unitRows[0]?.id || '';
    const initialSelectedLayerId = layerRows.find((item) => item.layerType === 'translation')?.id
      ?? layerRows.find((item) => item.layerType === 'transcription')?.id
      ?? '';
    setSelectedUnitIds?.(effectiveSelectedUnitId ? new Set([effectiveSelectedUnitId]) : new Set());
    setSelectedTimelineUnit?.(effectiveSelectedUnitId
      ? createTimelineUnit(initialSelectedLayerId, effectiveSelectedUnitId, 'unit')
      : null);
    setSelectedLayerId((prev) => {
      if (!prev) {
        if (initialSelectedLayerId) return initialSelectedLayerId;
      }
      return prev;
    });

    dbNameRef.current = db.name;
    const translationLayerRows = layerRows.filter((l) => l.layerType === 'translation');
    const projectTextId = unitRows[0]?.textId ?? layerRows[0]?.textId ?? '';
    const unitCount = unitRows.length;
    let unifiedUnitCount = unitCount;
    if (projectTextId.trim()) {
      const projectSegments = await LayerSegmentQueryService.listSegmentsByTextId(projectTextId);
      unifiedUnitCount = mergedTimelineUnitSemanticKeyCount({
        unitIds: unitRows.map((row) => row.id),
        segments: projectSegments,
      });
    }

    setState({
      phase: 'ready',
      dbName: db.name,
      unitCount,
      unifiedUnitCount,
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
    setUnitDrafts,
    setUnits,
  ]);

  /**
   * 延迟加载 token/morpheme 并合并到 units 的 words 缓存 |
   * Lazily load token/morpheme annotations and merge into unit words cache.
   */
  const loadLinguisticAnnotations = useCallback(async () => {
    const db = await getDb();
    const [tokenDocs, morphemeDocs] = await Promise.all([
      db.collections.unit_tokens.find().exec(),
      db.collections.unit_morphemes.find().exec(),
    ]);
    const tokenRows = tokenDocs
      .map((doc) => doc.toJSON() as unknown as UnitTokenDocType)
      .sort((a, b) => {
        if (a.unitId === b.unitId) return a.tokenIndex - b.tokenIndex;
        return a.unitId.localeCompare(b.unitId);
      });
    const morphemeRows = morphemeDocs
      .map((doc) => doc.toJSON() as unknown as UnitMorphemeDocType)
      .sort((a, b) => {
        if (a.tokenId === b.tokenId) return a.morphemeIndex - b.morphemeIndex;
        return a.tokenId.localeCompare(b.tokenId);
      });

    if (tokenRows.length === 0) return;

    const tokensByUnit = new Map<string, UnitTokenDocType[]>();
    tokenRows.forEach((token) => {
      const list = tokensByUnit.get(token.unitId) ?? [];
      list.push(token);
      tokensByUnit.set(token.unitId, list);
    });
    const morphemesByToken = new Map<string, UnitMorphemeDocType[]>();
    morphemeRows.forEach((morpheme) => {
      const list = morphemesByToken.get(morpheme.tokenId) ?? [];
      list.push(morpheme);
      morphemesByToken.set(morpheme.tokenId, list);
    });

    setUnits((prev) => prev.map((row) => {
      const canonicalTokens = tokensByUnit.get(row.id);
      if (!canonicalTokens || canonicalTokens.length === 0) return row;

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

      return { ...row, words };
    }));
  }, [setUnits]);

  return {
    loadSnapshot,
    loadLinguisticAnnotations,
  };
}