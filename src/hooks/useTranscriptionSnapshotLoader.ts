import { useCallback } from 'react';
import { getDb } from '../db';
import type { AnchorDocType, LayerLinkDocType, MediaItemDocType, SpeakerDocType, LayerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import type { UnitMorphemeDocType, UnitTokenDocType } from '../db';
import { mergedTimelineUnitSemanticKeyCount } from './timelineUnitView';
import { listUnitTextsFromSegmentation } from '../services/LayerSegmentationTextService';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';
import { listUnitDocsFromCanonicalLayerUnits } from '../services/LayerSegmentGraphService';
import { LinguisticService } from '../services/LinguisticService';
import { createTimelineUnit, type DbState, type TimelineUnit } from './transcriptionTypes';
import {
  assertTranscriptionDependencyLayerInvariant,
  scopeLayerLinksToLayerIdSet,
} from '../utils/transcriptionLayerDependencyInvariant';

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
  /** 与 `useTranscriptionMediaSelection` 对齐：快照恢复后若未选时间轴媒体，则同步到当前文本下的首条可用媒体。 */
  setSelectedMediaId?: React.Dispatch<React.SetStateAction<string>>;
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
  setSelectedMediaId,
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

    const projectLayerIds = new Set(layerRows.map((l) => l.id));
    const scopedLinksForInvariant = scopeLayerLinksToLayerIdSet(linkRows, projectLayerIds);
    assertTranscriptionDependencyLayerInvariant({
      layers: layerRows,
      layerLinks: scopedLinksForInvariant,
    });

    setUnits(unitRows);
    setAnchors(anchorRows);
    setLayers(layerRows);
    setTranslations(translationRows);
    setMediaItems(mediaRows);
    setSpeakers(speakerRows);
    setLayerLinks(linkRows);

    if (setSelectedMediaId) {
      const textId = activeTextId ?? '';
      const projectMedia = textId
        ? mediaRows.filter((m) => m.textId === textId)
        : mediaRows;
      const fromUnit = unitRows
        .map((u) => u.mediaId?.trim())
        .find((id): id is string => Boolean(id && projectMedia.some((m) => m.id === id)));
      const initialMediaId = fromUnit ?? projectMedia[0]?.id;
      if (initialMediaId) {
        setSelectedMediaId((prev) => {
          const p = typeof prev === 'string' ? prev.trim() : '';
          return p.length > 0 ? prev : initialMediaId;
        });
      }
    }

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
    let textLogicalDurationSecFromSnapshot: number | undefined;
    if (projectTextId.trim()) {
      const [projectSegments, textDoc] = await Promise.all([
        LayerSegmentQueryService.listSegmentsByTextId(projectTextId),
        LinguisticService.getTextById(projectTextId),
      ]);
      unifiedUnitCount = mergedTimelineUnitSemanticKeyCount({
        unitIds: unitRows.map((row) => row.id),
        segments: projectSegments,
      });
      const m = textDoc?.metadata as { logicalDurationSec?: unknown } | undefined;
      if (typeof m?.logicalDurationSec === 'number' && Number.isFinite(m.logicalDurationSec) && m.logicalDurationSec > 0) {
        textLogicalDurationSecFromSnapshot = m.logicalDurationSec;
      }
    }

    setState({
      phase: 'ready',
      dbName: db.name,
      unitCount,
      unifiedUnitCount,
      ...(textLogicalDurationSecFromSnapshot !== undefined ? { textLogicalDurationSecFromSnapshot } : {}),
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
    setSelectedMediaId,
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