import { getDb, type JieyuDatabase, type LayerUnitDocType, type SpeakerDocType } from '../db';
import { withTransaction } from '../db/withTransaction';
import type { SpeakerReferenceStatsBundle } from '../hooks/speakerManagement/types';
import { normalizeUnitDocForStorage } from '../utils/camDataUtils';
import { newId } from '../utils/transcriptionFormatters';
import {
  bulkUpsertUnitLayerUnits,
  getUnitDocProjectionById,
  listUnitDocsForMedia,
  listUnitDocsFromCanonicalLayerUnits,
} from './LayerSegmentGraphService';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import { LayerUnitSegmentWriteService } from './LayerUnitSegmentWriteService';
import { scheduleSegmentMetaSyncForUnitIds } from './segmentMetaSyncBestEffort';
import { storagePort } from '../db/storagePort';
import { attachSpeakerToProject, detachSpeakerFromProjects } from './speakerProjectMembership';
import { CatalogOwnershipMismatchError, requireCatalogProjectId } from './projectCatalogScope';

function sortSpeakers(rows: SpeakerDocType[]): SpeakerDocType[] {
  return rows.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'zh-Hans-CN');
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id, 'en');
  });
}

/** 全库说话人（跨项目，显式整表）| Every speaker in the library (cross-project, explicit full read) */
export async function getSpeakers(): Promise<SpeakerDocType[]> {
  const db = await getDb();
  return sortSpeakers(await db.dexie.speakers.toArray());
}

/** 只读：本项目的说话人；没有项目时为空（D11）| Read-only: this project's speakers; empty without a project */
export async function listSpeakersForProject(textId: string): Promise<SpeakerDocType[]> {
  const id = textId.trim();
  if (!id) return [];
  // P2-3：走 textId 索引 | P2-3: via the textId index
  const db = await getDb();
  return sortSpeakers(await db.dexie.speakers.where('textId').equals(id).toArray());
}

function assertSpeakerOwnsRows(
  speaker: SpeakerDocType,
  rows: ReadonlyArray<{ textId?: string | undefined }>,
): void {
  const foreign = rows.find((row) => (row.textId?.trim() ?? '') !== speaker.textId);
  if (foreign) {
    throw new CatalogOwnershipMismatchError(
      'speakers',
      speaker.id,
      speaker.textId,
      foreign.textId ?? '',
    );
  }
}

export async function getSpeakerReferenceStats(options?: {
  mediaId?: string | null;
}): Promise<SpeakerReferenceStatsBundle> {
  const db = await getDb();
  const mediaKey = typeof options?.mediaId === 'string' ? options.mediaId.trim() : '';
  // FS-4: with a media id, read through the mediaId index instead of projecting the whole library.
  const [unitRows, segments] = await Promise.all(
    mediaKey.length > 0
      ? [
          listUnitDocsForMedia(db, mediaKey),
          LayerSegmentQueryService.listSegmentsByMediaId(mediaKey),
        ]
      : [listUnitDocsFromCanonicalLayerUnits(db), LayerSegmentQueryService.listAllSegments()],
  );

  const stats = new Map<
    string,
    { transcriptionUnitCount: number; segmentCount: number; totalCount: number }
  >();
  const unassigned = { transcriptionUnitCount: 0, segmentCount: 0, totalCount: 0 };

  const ensure = (speakerId: string) => {
    const normalizedId = speakerId.trim();
    if (!normalizedId) return null;
    const existing = stats.get(normalizedId);
    if (existing) return existing;
    const next = { transcriptionUnitCount: 0, segmentCount: 0, totalCount: 0 };
    stats.set(normalizedId, next);
    return next;
  };

  for (const doc of unitRows) {
    const speakerId = doc.speakerId?.trim();
    if (!speakerId) {
      unassigned.transcriptionUnitCount += 1;
      unassigned.totalCount += 1;
      continue;
    }
    const target = ensure(speakerId);
    if (!target) continue;
    target.transcriptionUnitCount += 1;
    target.totalCount += 1;
  }

  for (const segment of segments) {
    const speakerId = segment.speakerId?.trim();
    if (!speakerId) {
      unassigned.segmentCount += 1;
      unassigned.totalCount += 1;
      continue;
    }
    const target = ensure(speakerId);
    if (!target) continue;
    target.segmentCount += 1;
    target.totalCount += 1;
  }

  return { perSpeaker: Object.fromEntries(stats.entries()), unassigned };
}

export async function createSpeaker(input: {
  name: string;
  /** 所属项目（必填）| Owning project (required) */
  textId: string;
  pseudonym?: string;
  role?: SpeakerDocType['role'];
  dialect?: string;
  accent?: string;
  languageIds?: string[];
  notes?: SpeakerDocType['notes'];
}): Promise<SpeakerDocType> {
  const db = await getDb();
  const name = input.name.trim();
  if (!name) throw new Error('\u8bf4\u8bdd\u4eba\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a');

  const normalizedName = name.toLocaleLowerCase('zh-Hans-CN');
  const projectTextId = requireCatalogProjectId(input.textId);
  const existingSpeakers = await listSpeakersForProject(projectTextId);
  const duplicate = existingSpeakers.find(
    (speaker) => speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName,
  );
  if (duplicate) return duplicate;

  const now = new Date().toISOString();
  const dialect = input.dialect?.trim();
  const accent = input.accent?.trim();
  const languageIds = input.languageIds?.map((id) => id.trim()).filter((id) => id.length > 0);
  const notes =
    input.notes && Object.values(input.notes).some((part) => part.trim().length > 0)
      ? input.notes
      : undefined;
  const speaker: SpeakerDocType = {
    id: newId('speaker'),
    name,
    ...(input.pseudonym?.trim() ? { pseudonym: input.pseudonym.trim() } : {}),
    ...(input.role ? { role: input.role } : {}),
    ...(dialect ? { dialect } : {}),
    ...(accent ? { accent } : {}),
    ...(languageIds && languageIds.length > 0 ? { languageIds } : {}),
    ...(notes ? { notes } : {}),
    textId: projectTextId,
    createdAt: now,
    updatedAt: now,
  };

  await db.collections.speakers.insert(speaker);
  await attachSpeakerToProject(speaker.id, projectTextId);
  return speaker;
}

/** Patch optional fieldwork attrs on an existing speaker (import enrichment). */
export async function patchSpeakerImportAttrs(
  speakerId: string,
  attrs: {
    dialect?: string;
    accent?: string;
    languageIds?: string[];
    notes?: SpeakerDocType['notes'];
  },
): Promise<SpeakerDocType | undefined> {
  const db = await getDb();
  const id = speakerId.trim();
  if (!id) return undefined;
  const speakerDoc = await db.collections.speakers.findOne({ selector: { id } }).exec();
  if (!speakerDoc) return undefined;
  const current = speakerDoc.toJSON() as SpeakerDocType;
  const dialect = attrs.dialect?.trim();
  const accent = attrs.accent?.trim();
  const languageIds = attrs.languageIds?.map((v) => v.trim()).filter((v) => v.length > 0);
  const notesBlank =
    !current.notes || Object.values(current.notes).every((part) => part.trim().length === 0);
  const notes =
    attrs.notes && notesBlank && Object.values(attrs.notes).some((part) => part.trim().length > 0)
      ? attrs.notes
      : undefined;
  const next: SpeakerDocType = {
    ...current,
    ...(dialect && !current.dialect ? { dialect } : {}),
    ...(accent && !current.accent ? { accent } : {}),
    ...(languageIds && languageIds.length > 0 && !current.languageIds?.length
      ? { languageIds }
      : {}),
    ...(notes ? { notes } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (
    next.dialect === current.dialect &&
    next.accent === current.accent &&
    next.notes === current.notes &&
    JSON.stringify(next.languageIds ?? []) === JSON.stringify(current.languageIds ?? [])
  ) {
    return current;
  }
  await db.collections.speakers.insert(next);
  return next;
}

export async function renameSpeaker(speakerId: string, nextName: string): Promise<SpeakerDocType> {
  const db = await getDb();
  const id = speakerId.trim();
  const name = nextName.trim();
  if (!id) throw new Error('\u8bf4\u8bdd\u4eba ID \u4e0d\u80fd\u4e3a\u7a7a');
  if (!name) throw new Error('\u8bf4\u8bdd\u4eba\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a');

  const speakerDoc = await db.collections.speakers.findOne({ selector: { id } }).exec();
  if (!speakerDoc) throw new Error(`\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${id}`);

  const normalizedName = name.toLocaleLowerCase('zh-Hans-CN');
  const ownerTextId = speakerDoc.toJSON().textId;
  const existingSpeakers = await listSpeakersForProject(ownerTextId);
  const duplicate = existingSpeakers.find(
    (speaker) =>
      speaker.id !== id && speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName,
  );
  if (duplicate) throw new Error(`\u8bf4\u8bdd\u4eba\u5df2\u5b58\u5728: ${duplicate.name}`);

  const current = speakerDoc.toJSON();
  const now = new Date().toISOString();
  const updated: SpeakerDocType = {
    ...current,
    name,
    updatedAt: now,
  };
  await db.collections.speakers.insert(updated);

  return updated;
}

export async function mergeSpeakers(
  sourceSpeakerId: string,
  targetSpeakerId: string,
): Promise<number> {
  const sourceId = sourceSpeakerId.trim();
  const targetId = targetSpeakerId.trim();
  if (!sourceId || !targetId) throw new Error('\u8bf4\u8bdd\u4eba ID \u4e0d\u80fd\u4e3a\u7a7a');
  if (sourceId === targetId) return 0;
  return deleteSpeaker(sourceId, { strategy: 'merge', targetSpeakerId: targetId });
}

type DeleteSpeakerOptions = {
  strategy?: 'clear' | 'merge' | 'reject';
  targetSpeakerId?: string;
};

/**
 * ADR-0048：删除说话人是一次业务操作。句段改写、说话人删除和项目名单在同一个事务里提交，
 * 中途失败时整体回滚。句段元数据同步在提交之后才排。
 */
export async function deleteSpeaker(
  speakerId: string,
  options: DeleteSpeakerOptions = {},
): Promise<number> {
  const db = await getDb();
  let outcome: { affectedCount: number; touchedIds: string[] };
  try {
    outcome = await withTransaction(
      db,
      'rw',
      [
        db.dexie.speakers,
        db.dexie.layer_units,
        db.dexie.layer_unit_contents,
        db.dexie.texts,
        db.dexie.tier_definitions,
        db.dexie.annotation_documents,
      ],
      () => deleteSpeakerIn(db, speakerId, options),
      { label: 'speakers.delete' },
    );
  } catch (error) {
    throw error instanceof Error && error.cause instanceof Error ? error.cause : error;
  }
  scheduleSegmentMetaSyncForUnitIds(
    outcome.touchedIds,
    'linguisticServiceSpeakerOps.deleteSpeaker',
  );
  return outcome.affectedCount;
}

async function deleteSpeakerIn(
  db: JieyuDatabase,
  speakerId: string,
  options: DeleteSpeakerOptions,
): Promise<{ affectedCount: number; touchedIds: string[] }> {
  const id = speakerId.trim();
  if (!id) throw new Error('\u8bf4\u8bdd\u4eba ID \u4e0d\u80fd\u4e3a\u7a7a');

  const strategy = options.strategy ?? 'reject';
  const speakerDoc = await db.collections.speakers.findOne({ selector: { id } }).exec();
  if (!speakerDoc) throw new Error(`\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${id}`);

  // 直接按 speakerId 索引读原始行：投影读取内部会 await getDb()，外层事务会提前提交
  const rows = (await db.dexie.layer_units.where('speakerId').equals(id).toArray()).filter(
    (row) => row.unitType === 'unit' || row.unitType === 'segment',
  );
  const affectedCount = rows.length;

  if (affectedCount > 0 && strategy === 'reject') {
    throw new Error(
      `\u8bf4\u8bdd\u4eba\u4ecd\u88ab ${affectedCount} \u6761\u53e5\u6bb5\u5f15\u7528`,
    );
  }

  const now = new Date().toISOString();
  let mergeTargetId = '';

  if (strategy === 'merge') {
    const targetId = options.targetSpeakerId?.trim();
    if (!targetId)
      throw new Error(
        '\u5220\u9664\u8bf4\u8bdd\u4eba\u65f6\u672a\u6307\u5b9a\u8fc1\u79fb\u76ee\u6807',
      );
    if (targetId === id)
      throw new Error('\u8fc1\u79fb\u76ee\u6807\u4e0d\u80fd\u662f\u5f53\u524d\u8bf4\u8bdd\u4eba');
    const targetDoc = await db.collections.speakers.findOne({ selector: { id: targetId } }).exec();
    if (!targetDoc)
      throw new Error(`\u76ee\u6807\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${targetId}`);
    const target = targetDoc.toJSON();
    const source = speakerDoc.toJSON();
    if (source.textId !== target.textId) {
      throw new CatalogOwnershipMismatchError('speakers', target.id, target.textId, source.textId);
    }
    mergeTargetId = target.id;
    await db.dexie.layer_units.bulkPut(
      rows.map((row) => ({
        ...row,
        speakerId: target.id,
        ...(row.unitType === 'unit' ? { speaker: target.name } : {}),
        updatedAt: now,
      })),
    );
  }

  if (affectedCount > 0 && strategy === 'clear') {
    await db.dexie.layer_units.bulkPut(
      rows.map(({ speakerId: _oldSpeakerId, ...rest }) => ({ ...rest, updatedAt: now })),
    );
  }

  await db.dexie.speakers.delete(id);
  await detachSpeakerFromProjects(id, db);
  if (mergeTargetId.length > 0) {
    const projectIds = new Set<string>();
    const owner = speakerDoc.toJSON().textId.trim();
    if (owner.length > 0) projectIds.add(owner);
    for (const row of rows) {
      const textId = row.textId.trim();
      if (textId.length > 0) projectIds.add(textId);
    }
    for (const textId of projectIds) {
      await attachSpeakerToProject(mergeTargetId, textId, db);
    }
  }
  return { affectedCount, touchedIds: rows.map((row) => row.id) };
}

export async function assignSpeakerToUnits(
  unitIds: Iterable<string>,
  speakerId?: string,
): Promise<number> {
  const db = await getDb();
  const ids = [
    ...new Set(
      Array.from(unitIds)
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];
  if (ids.length === 0) return 0;

  const selectedSpeakerId = speakerId?.trim();
  let speaker: SpeakerDocType | undefined;
  if (selectedSpeakerId) {
    const speakerDoc = await db.collections.speakers
      .findOne({ selector: { id: selectedSpeakerId } })
      .exec();
    if (!speakerDoc) {
      throw new Error(`\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${selectedSpeakerId}`);
    }
    speaker = speakerDoc.toJSON();
  }

  const rows = (await Promise.all(ids.map((id) => getUnitDocProjectionById(db, id)))).filter(
    (row): row is LayerUnitDocType => Boolean(row),
  );
  if (rows.length === 0) return 0;
  if (speaker) assertSpeakerOwnsRows(speaker, rows);

  const now = new Date().toISOString();
  const updates = rows.map((row) => {
    const { speaker: _oldSpeaker, speakerId: _oldSpeakerId, ...rest } = row;
    return normalizeUnitDocForStorage({
      ...rest,
      ...(speaker ? { speaker: speaker.name, speakerId: speaker.id } : {}),
      updatedAt: now,
    });
  });

  await bulkUpsertUnitLayerUnits(db, updates);
  if (speaker) {
    const projectIds = [
      ...new Set(updates.map((row) => row.textId.trim()).filter((textId) => textId.length > 0)),
    ];
    for (const textId of projectIds) {
      await attachSpeakerToProject(speaker.id, textId);
    }
  }
  scheduleSegmentMetaSyncForUnitIds(
    updates.map((row) => row.id),
    'linguisticServiceSpeakerOps.renameSpeaker',
  );
  return updates.length;
}

export async function assignSpeakerToSegments(
  segmentIds: Iterable<string>,
  speakerId?: string,
): Promise<number> {
  const db = await getDb();
  const ids = [
    ...new Set(
      Array.from(segmentIds)
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];
  if (ids.length === 0) return 0;

  const selectedSpeakerId = speakerId?.trim();
  let resolvedSpeaker: SpeakerDocType | undefined;
  if (selectedSpeakerId) {
    const speakerDoc = await db.collections.speakers
      .findOne({ selector: { id: selectedSpeakerId } })
      .exec();
    if (!speakerDoc) {
      throw new Error(`\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${selectedSpeakerId}`);
    }
    resolvedSpeaker = speakerDoc.toJSON();
  }
  const resolvedSpeakerId = resolvedSpeaker?.id;

  const rows = await LayerSegmentQueryService.listSegmentsByIds(ids);
  if (rows.length === 0) return 0;
  if (resolvedSpeaker) assertSpeakerOwnsRows(resolvedSpeaker, rows);

  const now = new Date().toISOString();
  const updates = rows.map((row) => {
    const { speakerId: _oldSpeakerId, ...rest } = row;
    return {
      ...rest,
      ...(resolvedSpeakerId ? { speakerId: resolvedSpeakerId } : {}),
      updatedAt: now,
    };
  });

  await LayerUnitSegmentWriteService.upsertSegments(db, updates);
  scheduleSegmentMetaSyncForUnitIds(
    updates.map((row) => row.id),
    'linguisticServiceSpeakerOps.renameSpeaker',
  );
  return updates.length;
}

/** Mixed selection is one user action: never commit segments without its units. */
export async function assignSpeakerToMixedSelection(input: {
  textId: string;
  segmentIds: readonly string[];
  unitIds: readonly string[];
  speakerId?: string;
}): Promise<{ segments: number; units: number }> {
  const result = await storagePort().assignSpeakerToMixedSelection(input);
  scheduleSegmentMetaSyncForUnitIds(
    [...input.segmentIds, ...input.unitIds],
    'linguisticServiceSpeakerOps.assignMixedSelection',
  );
  return { segments: result.segments, units: result.units };
}

export async function createAndAssignSpeakerToMixedSelection(input: {
  segmentIds: readonly string[];
  unitIds: readonly string[];
  name: string;
  textId: string;
}): Promise<{ speaker: SpeakerDocType; segments: number; units: number; created: boolean }> {
  const result = await storagePort().assignSpeakerToMixedSelection({
    textId: input.textId,
    segmentIds: input.segmentIds,
    unitIds: input.unitIds,
    createSpeaker: { name: input.name, textId: input.textId },
  });
  if (!result.speaker) throw new Error('mixed speaker selection requires a speaker');
  scheduleSegmentMetaSyncForUnitIds(
    [...input.segmentIds, ...input.unitIds],
    'linguisticServiceSpeakerOps.createAndAssignMixedSelection',
  );
  return {
    speaker: result.speaker,
    segments: result.segments,
    units: result.units,
    created: result.created === true,
  };
}
