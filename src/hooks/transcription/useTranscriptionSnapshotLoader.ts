import { useCallback } from 'react';
import { getDb } from '../../db';
import type {
  AnchorDocType,
  LayerLinkDocType,
  MediaItemDocType,
  SpeakerDocType,
  LayerDocType,
  LayerUnitDocType,
  LayerUnitContentDocType,
} from '../../db';
import type { UnitMorphemeDocType, UnitTokenDocType } from '../../db';
import { mergedTimelineUnitSemanticKeyCount } from './timelineUnitView';
import { listUnitTextsFromSegmentationForText } from '../../services/LayerSegmentationTextService';
import { LayerSegmentQueryService } from '../../services/LayerSegmentQueryService';
import { listUnitDocsForText } from '../../services/LayerSegmentGraphService';
import { LinguisticService } from '../../services/LinguisticService';
import { createTimelineUnit, type DbState, type TimelineUnit } from './transcriptionTypes';
import {
  assertTranscriptionDependencyLayerInvariant,
  scopeLayerLinksToLayerIdSet,
} from '../../utils/transcriptionLayerDependencyInvariant';

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
  /**
   * 载入一个项目的工作台快照。`textId` 必填（JY-02）：不再按 `units[0]` 猜项目，也不再把其它项目的
   * units / 段文本 / 媒体 / 关系装进状态；所有查询都按项目走索引（JY-15）。空 `textId` 表示当前没有项目，
   * 清空工作台状态。
   *
   * Load the workspace snapshot of ONE project. `textId` is required (JY-02): the project is no
   * longer guessed from `units[0]`, and other projects' units / segment texts / media / links never
   * enter state; every query is project-indexed (JY-15). An empty `textId` means "no project" and
   * clears the workspace state.
   */
  const loadSnapshot = useCallback(
    async (textId: string) => {
      const db = await getDb();
      const scopedTextId = typeof textId === 'string' ? textId.trim() : '';
      const hasProject = scopedTextId.length > 0;
      const [unitRows, layerDocs, mediaRows] = hasProject
        ? await Promise.all([
            listUnitDocsForText(db, scopedTextId),
            db.collections.layers.findByIndex('textId', scopedTextId),
            db.dexie.media_items.where('textId').equals(scopedTextId).toArray(),
          ])
        : [[] as LayerUnitDocType[], [], [] as MediaItemDocType[]];
      const layerRows = layerDocs
        .map((doc) => doc.toJSON() as unknown as LayerDocType)
        .filter((layer) => layer.textId === scopedTextId);
      const projectLayerIds = [...new Set(layerRows.map((l) => l.id))];
      const projectMediaIds = mediaRows.map((row) => row.id);
      const [anchorRows, linksByLayer, linksByHost, translationRows] = hasProject
        ? await Promise.all([
            projectMediaIds.length > 0
              ? db.dexie.anchors.where('mediaId').anyOf(projectMediaIds).toArray()
              : Promise.resolve([] as AnchorDocType[]),
            projectLayerIds.length > 0
              ? db.dexie.layer_links.where('layerId').anyOf(projectLayerIds).toArray()
              : Promise.resolve([] as LayerLinkDocType[]),
            projectLayerIds.length > 0
              ? db.dexie.layer_links
                  .where('hostTranscriptionLayerId')
                  .anyOf(projectLayerIds)
                  .toArray()
              : Promise.resolve([] as LayerLinkDocType[]),
            listUnitTextsFromSegmentationForText(scopedTextId),
          ])
        : [[] as AnchorDocType[], [], [], [] as LayerUnitContentDocType[]];
      // 关系行没有 textId：按任一端落在本项目图层上取 | Links carry no textId: either end on a project layer
      const linkRows = scopeLayerLinksToLayerIdSet(
        [
          ...new Map(
            [...linksByLayer, ...linksByHost].map((row) => [row.id, row] as const),
          ).values(),
        ],
        new Set(projectLayerIds),
      );
      const resolvedTextId = scopedTextId;

      // token/morpheme 延迟加载，不阻塞首屏 | Deferred to loadLinguisticAnnotations
      assertTranscriptionDependencyLayerInvariant({
        layers: layerRows,
        layerLinks: linkRows,
      });

      setUnits(unitRows);
      setAnchors(anchorRows);
      setLayers(layerRows);
      setTranslations(translationRows);
      setMediaItems(mediaRows);
      setSpeakers(
        resolvedTextId.length > 0
          ? await LinguisticService.speakers.listForProject(resolvedTextId)
          : [],
      );
      setLayerLinks(linkRows);

      const scopedUnits = unitRows;

      if (setSelectedMediaId) {
        const projectMedia = mediaRows;
        const fromUnit = scopedUnits
          .map((u) => u.mediaId?.trim())
          .find(
            (id): id is string =>
              typeof id === 'string' && id.length > 0 && projectMedia.some((m) => m.id === id),
          );
        const initialMediaId = fromUnit ?? projectMedia[0]?.id;
        if (typeof initialMediaId === 'string' && initialMediaId.length > 0) {
          setSelectedMediaId((prev) => {
            const p = typeof prev === 'string' ? prev.trim() : '';
            if (scopedTextId.length > 0) {
              const prevInProject = p.length > 0 && projectMedia.some((m) => m.id === p);
              return prevInProject ? prev : initialMediaId;
            }
            return p.length > 0 ? prev : initialMediaId;
          });
        }
      }

      setUnitDrafts(() => {
        const next: Record<string, string> = {};
        unitRows.forEach((row) => {
          const defaultTrcLayer =
            layerRows.find((l) => l.layerType === 'transcription' && l.isDefault) ??
            layerRows.find((l) => l.layerType === 'transcription');
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

      const rawSelectedUnitId = scopedUnits[0]?.id;
      const effectiveSelectedUnitId =
        typeof rawSelectedUnitId === 'string' ? rawSelectedUnitId.trim() : '';
      const initialSelectedLayerId =
        layerRows.find((item) => item.layerType === 'translation')?.id ??
        layerRows.find((item) => item.layerType === 'transcription')?.id ??
        '';
      setSelectedUnitIds?.(
        effectiveSelectedUnitId.length > 0 ? new Set([effectiveSelectedUnitId]) : new Set(),
      );
      setSelectedTimelineUnit?.(
        effectiveSelectedUnitId.length > 0
          ? createTimelineUnit(initialSelectedLayerId, effectiveSelectedUnitId, 'unit')
          : null,
      );
      setSelectedLayerId((prev) => {
        const prevId = typeof prev === 'string' ? prev.trim() : '';
        const prevInProject = prevId.length > 0 && layerRows.some((layer) => layer.id === prevId);
        if (scopedTextId.length > 0) {
          if (prevInProject) return prev;
          return initialSelectedLayerId.length > 0 ? initialSelectedLayerId : prev;
        }
        if (prevId.length === 0 && initialSelectedLayerId.length > 0) {
          return initialSelectedLayerId;
        }
        return prev;
      });

      dbNameRef.current = db.name;
      const translationLayerRows = layerRows.filter((l) => l.layerType === 'translation');
      const projectTextId =
        resolvedTextId.length > 0 ? resolvedTextId : (layerRows[0]?.textId ?? '');
      const unitCount = unitRows.length;
      let unifiedUnitCount = unitCount;
      let textLogicalDurationSecFromSnapshot: number | undefined;
      if (projectTextId.trim()) {
        const [projectSegments, textDoc] = await Promise.all([
          LayerSegmentQueryService.listSegmentsByTextId(projectTextId),
          LinguisticService.timeline.getTextById(projectTextId),
        ]);
        unifiedUnitCount = mergedTimelineUnitSemanticKeyCount({
          unitIds: scopedUnits.map((row) => row.id),
          segments: projectSegments,
        });
        const m = textDoc?.metadata as { logicalDurationSec?: unknown } | undefined;
        if (
          typeof m?.logicalDurationSec === 'number' &&
          Number.isFinite(m.logicalDurationSec) &&
          m.logicalDurationSec > 0
        ) {
          textLogicalDurationSecFromSnapshot = m.logicalDurationSec;
        }
      }

      setState({
        phase: 'ready',
        dbName: db.name,
        unitCount,
        unifiedUnitCount,
        ...(textLogicalDurationSecFromSnapshot !== undefined
          ? { textLogicalDurationSecFromSnapshot }
          : {}),
        translationLayerCount: translationLayerRows.length,
        translationRecordCount: translationRows.length,
      });
    },
    [
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
    ],
  );

  /**
   * 延迟加载 token/morpheme 并合并到 units 的 words 缓存 |
   * Lazily load token/morpheme annotations and merge into unit words cache.
   */
  const loadLinguisticAnnotations = useCallback(
    async (textId: string) => {
      const scopedTextId = textId.trim();
      if (scopedTextId.length === 0) return;
      const db = await getDb();
      // 只取本项目的 token / morpheme（JY-15）| Only this project's tokens / morphemes (JY-15)
      const [tokenDocs, morphemeDocs] = await Promise.all([
        db.dexie.unit_tokens.where('textId').equals(scopedTextId).toArray(),
        db.dexie.unit_morphemes.where('textId').equals(scopedTextId).toArray(),
      ]);
      const tokenRows = (tokenDocs as UnitTokenDocType[]).slice().sort((a, b) => {
        if (a.unitId === b.unitId) return a.tokenIndex - b.tokenIndex;
        return a.unitId.localeCompare(b.unitId);
      });
      const morphemeRows = (morphemeDocs as UnitMorphemeDocType[]).slice().sort((a, b) => {
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

      setUnits((prev) =>
        prev.map((row) => {
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
        }),
      );
    },
    [setUnits],
  );

  return {
    loadSnapshot,
    loadLinguisticAnnotations,
  };
}
