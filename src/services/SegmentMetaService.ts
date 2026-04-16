import {
  getDb,
  type LayerUnitContentDocType,
  type LayerUnitDocType,
  type LayerUnitStatus,
  type NoteCategory,
  type SegmentMetaDocType,
} from '../db';
import type { UtteranceSelfCertainty } from '../utils/utteranceSelfCertainty';

const NOTE_CATEGORY_ORDER: NoteCategory[] = ['todo', 'question', 'comment', 'correction', 'linguistic', 'fieldwork'];

export interface SegmentMetaSeed {
  id?: string;
  segmentId: string;
  unitKind?: SegmentMetaDocType['unitKind'];
  textId: string;
  mediaId: string;
  layerId: string;
  hostUtteranceId?: string;
  startTime: number;
  endTime: number;
  text?: string;
  effectiveSpeakerId?: string;
  effectiveSpeakerName?: string;
  noteCategoryKeys?: readonly NoteCategory[];
  effectiveSelfCertainty?: UtteranceSelfCertainty;
  annotationStatus?: LayerUnitStatus;
  aiConfidence?: number;
  sourceType?: 'human' | 'ai';
  createdAt?: string;
  updatedAt?: string;
}

export interface SegmentMetaSearchOptions {
  textId?: string;
  layerId?: string;
  mediaId?: string;
  speakerId?: string;
  noteCategory?: NoteCategory;
  selfCertainty?: UtteranceSelfCertainty;
  annotationStatus?: LayerUnitStatus;
  query?: string;
  hasText?: boolean;
  limit?: number;
}

interface SegmentMetaScope {
  layerId: string;
  mediaId: string;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function sortRows(rows: readonly SegmentMetaDocType[]): SegmentMetaDocType[] {
  return [...rows].sort((left, right) => {
    if (left.startTime !== right.startTime) return left.startTime - right.startTime;
    if (left.endTime !== right.endTime) return left.endTime - right.endTime;
    return left.segmentId.localeCompare(right.segmentId);
  });
}

function sortNoteCategories(categories: readonly NoteCategory[] | undefined): NoteCategory[] | undefined {
  if (!categories || categories.length === 0) return undefined;
  const set = new Set(categories);
  const sorted = NOTE_CATEGORY_ORDER.filter((category) => set.has(category));
  return sorted.length > 0 ? sorted : undefined;
}

function resolveLatestIso(...values: Array<string | undefined>): string {
  const normalized = values.filter((value): value is string => Boolean(value)).sort();
  return normalized[normalized.length - 1] ?? new Date().toISOString();
}

function buildScopedDocId(layerId: string, segmentId: string): string {
  return `${layerId}::${segmentId}`;
}

function toDoc(seed: SegmentMetaSeed): SegmentMetaDocType {
  const now = new Date().toISOString();
  const text = seed.text?.trim() ?? '';
  const noteCategoryKeys = sortNoteCategories(seed.noteCategoryKeys);
  return {
    id: seed.id ?? buildScopedDocId(seed.layerId, seed.segmentId),
    segmentId: seed.segmentId,
    unitKind: seed.unitKind ?? 'segment',
    textId: seed.textId,
    mediaId: seed.mediaId,
    layerId: seed.layerId,
    ...(seed.hostUtteranceId ? { hostUtteranceId: seed.hostUtteranceId } : {}),
    startTime: seed.startTime,
    endTime: seed.endTime,
    text,
    normalizedText: normalizeText(text),
    hasText: text.length > 0,
    ...(seed.effectiveSpeakerId ? { effectiveSpeakerId: seed.effectiveSpeakerId } : {}),
    ...(seed.effectiveSpeakerName ? { effectiveSpeakerName: seed.effectiveSpeakerName } : {}),
    ...(noteCategoryKeys ? { noteCategoryKeys } : {}),
    ...(seed.effectiveSelfCertainty ? { effectiveSelfCertainty: seed.effectiveSelfCertainty } : {}),
    ...(seed.annotationStatus ? { annotationStatus: seed.annotationStatus } : {}),
    ...(typeof seed.aiConfidence === 'number' ? { aiConfidence: seed.aiConfidence } : {}),
    ...(seed.sourceType ? { sourceType: seed.sourceType } : {}),
    createdAt: seed.createdAt ?? now,
    updatedAt: seed.updatedAt ?? now,
  };
}

export class SegmentMetaService {
  static buildDocs(seeds: readonly SegmentMetaSeed[]): SegmentMetaDocType[] {
    return sortRows(seeds.map((seed) => toDoc(seed)));
  }

  static async upsertDocs(seeds: readonly SegmentMetaSeed[]): Promise<SegmentMetaDocType[]> {
    const docs = SegmentMetaService.buildDocs(seeds);
    const db = await getDb();
    if (docs.length === 0) return docs;
    await db.dexie.segment_meta.bulkPut(docs);
    return docs;
  }

  static async replaceDocsForLayerMedia(
    layerId: string,
    mediaId: string,
    seeds: readonly SegmentMetaSeed[],
  ): Promise<SegmentMetaDocType[]> {
    const normalizedLayerId = layerId.trim();
    const normalizedMediaId = mediaId.trim();
    if (!normalizedLayerId || !normalizedMediaId) return [];

    const docs = SegmentMetaService.buildDocs(
      seeds.filter((seed) => seed.layerId === normalizedLayerId && seed.mediaId === normalizedMediaId),
    );
    const db = await getDb();
    await db.dexie.transaction('rw', db.dexie.segment_meta, async () => {
      await db.dexie.segment_meta.where('[layerId+mediaId]').equals([normalizedLayerId, normalizedMediaId]).delete();
      if (docs.length > 0) {
        await db.dexie.segment_meta.bulkPut(docs);
      }
    });
    return docs;
  }

  static async listByLayerMedia(layerId: string, mediaId: string): Promise<SegmentMetaDocType[]> {
    const normalizedLayerId = layerId.trim();
    const normalizedMediaId = mediaId.trim();
    if (!normalizedLayerId || !normalizedMediaId) return [];

    const db = await getDb();
    const rows = await db.dexie.segment_meta
      .where('[layerId+mediaId]')
      .equals([normalizedLayerId, normalizedMediaId])
      .toArray();
    return sortRows(rows);
  }

  static async rebuildScopes(scopes: readonly SegmentMetaScope[]): Promise<void> {
    const deduped = new Map<string, SegmentMetaScope>();
    for (const scope of scopes) {
      const layerId = scope.layerId.trim();
      const mediaId = scope.mediaId.trim();
      if (!layerId || !mediaId) continue;
      deduped.set(`${layerId}::${mediaId}`, { layerId, mediaId });
    }

    for (const scope of deduped.values()) {
      await SegmentMetaService.rebuildForLayerMedia(scope.layerId, scope.mediaId);
    }
  }

  static async syncForUnitIds(unitIds: Iterable<string>): Promise<void> {
    const ids = [...new Set(Array.from(unitIds).map((id) => id.trim()).filter((id) => id.length > 0))];
    if (ids.length === 0) return;

    const db = await getDb();
    const [units, staleRowsById, staleRowsByHostId] = await Promise.all([
      db.dexie.layer_units.bulkGet(ids).then((rows) => rows.filter((row): row is LayerUnitDocType => Boolean(row))),
      db.dexie.segment_meta.where('segmentId').anyOf(ids).toArray(),
      db.dexie.segment_meta.where('hostUtteranceId').anyOf(ids).toArray(),
    ]);
    const staleRows = [...new Map(
      [...staleRowsById, ...staleRowsByHostId].map((row) => [row.id, row] as const),
    ).values()];
    if (units.length === 0 && staleRows.length === 0) return;

    const relatedHostIds = [...new Set(units.flatMap((row) => {
      if (row.unitType === 'utterance') return [row.id];
      const hostIds: string[] = [];
      if (row.parentUnitId?.trim()) hostIds.push(row.parentUnitId.trim());
      if (row.rootUnitId?.trim()) hostIds.push(row.rootUnitId.trim());
      return hostIds;
    }))];
    const relatedHosts = relatedHostIds.length > 0
      ? (await db.dexie.layer_units.bulkGet(relatedHostIds)).filter((row): row is LayerUnitDocType => Boolean(row))
      : [];

    const referencingUnits = relatedHostIds.length > 0
      ? await Promise.all([
          db.dexie.layer_units.where('parentUnitId').anyOf(relatedHostIds).toArray(),
          db.dexie.layer_units.where('rootUnitId').anyOf(relatedHostIds).toArray(),
        ]).then(([fromParent, fromRoot]) => {
          const byId = new Map<string, LayerUnitDocType>();
          for (const row of [...fromParent, ...fromRoot]) {
            byId.set(row.id, row);
          }
          return [...byId.values()];
        })
      : [];

    await SegmentMetaService.rebuildScopes([
      ...units.map((row) => ({ layerId: row.layerId, mediaId: row.mediaId })),
      ...relatedHosts.map((row) => ({ layerId: row.layerId, mediaId: row.mediaId })),
      ...referencingUnits.map((row) => ({ layerId: row.layerId, mediaId: row.mediaId })),
      ...staleRows.map((row) => ({ layerId: row.layerId, mediaId: row.mediaId })),
    ]);
  }

  static async searchSegmentMeta(options: SegmentMetaSearchOptions): Promise<SegmentMetaDocType[]> {
    const db = await getDb();
    let rows: SegmentMetaDocType[];

    if (options.layerId && options.mediaId) {
      rows = await db.dexie.segment_meta.where('[layerId+mediaId]').equals([options.layerId, options.mediaId]).toArray();
    } else if (options.textId && options.layerId) {
      rows = await db.dexie.segment_meta.where('[textId+layerId]').equals([options.textId, options.layerId]).toArray();
    } else if (options.layerId) {
      rows = await db.dexie.segment_meta.where('layerId').equals(options.layerId).toArray();
    } else if (options.speakerId) {
      rows = await db.dexie.segment_meta.where('effectiveSpeakerId').equals(options.speakerId).toArray();
    } else if (options.selfCertainty) {
      rows = await db.dexie.segment_meta.where('effectiveSelfCertainty').equals(options.selfCertainty).toArray();
    } else if (options.annotationStatus) {
      rows = await db.dexie.segment_meta.where('annotationStatus').equals(options.annotationStatus).toArray();
    } else {
      rows = await db.dexie.segment_meta.toArray();
    }

    const normalizedQuery = normalizeText(options.query ?? '');
    const filtered = sortRows(rows).filter((row) => {
      if (options.textId && row.textId !== options.textId) return false;
      if (options.layerId && row.layerId !== options.layerId) return false;
      if (options.mediaId && row.mediaId !== options.mediaId) return false;
      if (options.speakerId && row.effectiveSpeakerId !== options.speakerId) return false;
      if (options.noteCategory && !(row.noteCategoryKeys?.includes(options.noteCategory))) return false;
      if (options.selfCertainty && row.effectiveSelfCertainty !== options.selfCertainty) return false;
      if (options.annotationStatus && row.annotationStatus !== options.annotationStatus) return false;
      if (typeof options.hasText === 'boolean' && row.hasText !== options.hasText) return false;
      if (normalizedQuery && !row.normalizedText.includes(normalizedQuery)) return false;
      return true;
    });

    const limit = typeof options.limit === 'number' && options.limit > 0
      ? Math.floor(options.limit)
      : undefined;
    return limit ? filtered.slice(0, limit) : filtered;
  }

  static async rebuildForLayerMedia(layerId: string, mediaId: string): Promise<SegmentMetaDocType[]> {
    const normalizedLayerId = layerId.trim();
    const normalizedMediaId = mediaId.trim();
    if (!normalizedLayerId || !normalizedMediaId) return [];

    const db = await getDb();
    const [unitRows, contentRows, noteRows, speakerRows] = await Promise.all([
      db.dexie.layer_units.where('[layerId+mediaId]').equals([normalizedLayerId, normalizedMediaId]).toArray(),
      db.dexie.layer_unit_contents.where('layerId').equals(normalizedLayerId).toArray(),
      db.dexie.user_notes.toArray(),
      db.dexie.speakers.toArray(),
    ]);

    const metaRows = unitRows.filter((row) => row.unitType === 'segment' || row.unitType === 'utterance');
    const hostIds = [...new Set(metaRows.flatMap((row) => {
      if (row.unitType === 'utterance') return [row.id];
      const ids: string[] = [];
      if (row.parentUnitId?.trim()) ids.push(row.parentUnitId.trim());
      if (row.rootUnitId?.trim()) ids.push(row.rootUnitId.trim());
      return ids;
    }))];
    const hostRows = await db.dexie.layer_units.bulkGet(hostIds);
    const hostById = new Map(hostRows.filter((row): row is LayerUnitDocType => Boolean(row)).map((row) => [row.id, row] as const));

    const contentsByUnitId = new Map<string, LayerUnitContentDocType[]>();
    for (const row of contentRows) {
      const bucket = contentsByUnitId.get(row.unitId);
      if (bucket) bucket.push(row);
      else contentsByUnitId.set(row.unitId, [row]);
    }

    const noteCategoriesByTargetId = new Map<string, NoteCategory[]>();
    for (const note of noteRows) {
      if (!note.category) continue;
      const bucket = noteCategoriesByTargetId.get(note.targetId);
      if (bucket) {
        if (!bucket.includes(note.category)) bucket.push(note.category);
      } else {
        noteCategoriesByTargetId.set(note.targetId, [note.category]);
      }
    }

    const speakerById = new Map(speakerRows.map((row) => [row.id, row] as const));
    const docs = SegmentMetaService.buildDocs(metaRows.map((unit) => {
      const parentHostId = unit.parentUnitId?.trim();
      const rootHostId = unit.rootUnitId?.trim();
      const host = unit.unitType === 'utterance'
        ? unit
        : (parentHostId ? hostById.get(parentHostId) : undefined)
          ?? (rootHostId ? hostById.get(rootHostId) : undefined);
      const content = (contentsByUnitId.get(unit.id) ?? []).find((row) => row.contentRole === 'primary_text')
        ?? (contentsByUnitId.get(unit.id) ?? []).find((row) => typeof row.text === 'string' && row.text.trim().length > 0)
        ?? (contentsByUnitId.get(unit.id) ?? [])[0];
      const effectiveSpeakerId = unit.speakerId?.trim() || host?.speakerId?.trim() || undefined;
      const speaker = effectiveSpeakerId ? speakerById.get(effectiveSpeakerId) : undefined;
      const noteCategoryKeys = sortNoteCategories([
        ...(noteCategoriesByTargetId.get(unit.id) ?? []),
        ...(host ? (noteCategoriesByTargetId.get(host.id) ?? []) : []),
      ]);
      return {
        segmentId: unit.id,
        unitKind: unit.unitType,
        textId: unit.textId,
        mediaId: unit.mediaId,
        layerId: unit.layerId,
        ...(host ? { hostUtteranceId: host.id } : {}),
        startTime: unit.startTime,
        endTime: unit.endTime,
        text: content?.text ?? '',
        ...(effectiveSpeakerId ? { effectiveSpeakerId } : {}),
        ...(speaker?.name ? { effectiveSpeakerName: speaker.name } : {}),
        ...(noteCategoryKeys ? { noteCategoryKeys } : {}),
        ...(host?.selfCertainty ? { effectiveSelfCertainty: host.selfCertainty } : {}),
        ...((host?.status ?? unit.status) ? { annotationStatus: (host?.status ?? unit.status) } : {}),
        ...(typeof content?.ai_metadata?.confidence === 'number' ? { aiConfidence: content.ai_metadata.confidence } : {}),
        ...(content?.sourceType ? { sourceType: content.sourceType } : {}),
        createdAt: unit.createdAt,
        updatedAt: resolveLatestIso(unit.updatedAt, content?.updatedAt, host?.updatedAt),
      };
    }));

    await db.dexie.transaction('rw', db.dexie.segment_meta, async () => {
      await db.dexie.segment_meta.where('[layerId+mediaId]').equals([normalizedLayerId, normalizedMediaId]).delete();
      if (docs.length > 0) {
        await db.dexie.segment_meta.bulkPut(docs);
      }
    });

    return docs;
  }
}
