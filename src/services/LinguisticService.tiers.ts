import { dexieStoresForTierAnnotationAtomicRw, dexieStoresForTierDefinitionAtomicRw, getDb, withTransaction, type AuditLogDocType, type AuditSource, type AnchorDocType, type TierAnnotationDocType } from '../db';
import { newId } from '../utils/transcriptionFormatters';
import { assertReviewProtection, assertStableId, normalizeTierAnnotationDocForStorage } from '../utils/camDataUtils';
import { type ConstraintSeverity, type ConstraintViolation, type TierSaveResult, validateTierConstraints } from './LinguisticService.constraints';

type TierDefinitionRecord = import('../db').TierDefinitionDocType;

const TRACKED_FIELDS: Record<string, readonly string[]> = {
  tier_annotations: ['value', 'startTime', 'endTime', 'startAnchorId', 'endAnchorId', 'isVerified', 'parentAnnotationId'],
  tier_definitions: ['parentTierId', 'extraParentTierIds', 'tierType', 'contentType', 'name', 'languageId', 'orthographyId', 'bridgeId', 'participantId', 'dataCategory', 'modality', 'isDefault', 'accessRights', 'delimiter', 'sortOrder'],
  units: ['transcription', 'startTime', 'endTime'],
};

let auditIdCounter = 0;

function generateAuditId(): string {
  return `audit_${Date.now()}_${++auditIdCounter}`;
}

function stringify(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

async function writeAuditLog(
  collection: string,
  documentId: string,
  action: AuditLogDocType['action'],
  source: AuditSource,
  changes?: Array<{ field: string; oldValue?: unknown; newValue?: unknown }>,
  dbArg?: Awaited<ReturnType<typeof getDb>>,
): Promise<void> {
  const db = dbArg ?? await getDb();
  const timestamp = new Date().toISOString();

  if (action === 'create' || action === 'delete' || !changes || changes.length === 0) {
    await db.dexie.audit_logs.put({
      id: generateAuditId(),
      collection,
      documentId,
      action,
      source,
      timestamp,
    });
    return;
  }

  for (const change of changes) {
    await db.dexie.audit_logs.put({
      id: generateAuditId(),
      collection,
      documentId,
      action,
      field: change.field,
      oldValue: stringify(change.oldValue),
      newValue: stringify(change.newValue),
      source,
      timestamp,
    });
  }
}

function diffTrackedFields(
  collection: string,
  oldDoc: Record<string, unknown>,
  newDoc: Record<string, unknown>,
): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
  const fields = TRACKED_FIELDS[collection];
  if (!fields) return [];
  const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
  for (const field of fields) {
    const ov = stringify(oldDoc[field]);
    const nv = stringify(newDoc[field]);
    if (ov !== nv) {
      changes.push({ field, oldValue: oldDoc[field], newValue: newDoc[field] });
    }
  }
  return changes;
}

export async function getTierDefinitions(textId: string): Promise<TierDefinitionRecord[]> {
  const db = await getDb();
  const docs = await db.collections.tier_definitions.findByIndex('textId', textId);
  return docs.map((doc) => doc.toJSON());
}

async function persistTierDefinition(data: TierDefinitionRecord, source: AuditSource): Promise<string> {
  const db = await getDb();
  const existing = await db.dexie.tier_definitions.get(data.id);
  return withTransaction(
    db,
    'rw',
    [...dexieStoresForTierDefinitionAtomicRw(db)],
    async () => {
      await db.dexie.tier_definitions.put(data);
      if (existing) {
        const changes = diffTrackedFields('tier_definitions', existing as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
        if (changes.length > 0) {
          await writeAuditLog('tier_definitions', data.id, 'update', source, changes, db);
        }
      } else {
        await writeAuditLog('tier_definitions', data.id, 'create', source, undefined, db);
      }
      return data.id;
    },
    { label: 'LinguisticService.persistTierDefinition' },
  );
}

export async function saveTierDefinition(data: TierDefinitionRecord, source: AuditSource = 'human'): Promise<TierSaveResult> {
  const db = await getDb();
  const allDocs = await db.collections.tier_definitions.findByIndex('textId', data.textId);
  const allTiers = allDocs.map((doc) => doc.toJSON());
  const merged = allTiers.filter((tier) => tier.id !== data.id);
  merged.push(data);

  const violations = validateTierConstraints(merged, []);
  const errors = violations.filter((violation) => violation.severity === 'error');
  if (errors.length > 0) {
    return { id: '', errors, warnings: [] };
  }

  const id = await persistTierDefinition(data, source);
  const warnings = violations.filter((violation) => violation.severity === 'warning');
  return { id, errors: [], warnings };
}

export async function removeTierDefinition(id: string, source: AuditSource = 'human'): Promise<{ errors: ConstraintViolation[] }> {
  const db = await getDb();
  const allDocs = await db.collections.tier_definitions.findByIndex('parentTierId', id);
  const childTiers = allDocs.map((doc) => doc.toJSON());
  if (childTiers.length > 0) {
    return {
      errors: childTiers.map((childTier) => ({
        rule: 'CASCADE',
        severity: 'error' as ConstraintSeverity,
        tierId: id,
        message: `Cannot delete: child tier "${childTier.key}" (${childTier.id}) still references this tier as parent.`,
      })),
    };
  }

  const annotationDocs = await db.collections.tier_annotations.findByIndex('tierId', id);
  const tierAnnotations = annotationDocs.map((doc) => doc.toJSON());
  await withTransaction(
    db,
    'rw',
    [...dexieStoresForTierDefinitionAtomicRw(db)],
    async () => {
      for (const annotation of tierAnnotations) {
        if (annotation.startAnchorId) await db.collections.anchors.remove(annotation.startAnchorId);
        if (annotation.endAnchorId) await db.collections.anchors.remove(annotation.endAnchorId);
        await db.collections.tier_annotations.remove(annotation.id);
        await writeAuditLog('tier_annotations', annotation.id, 'delete', source, undefined, db);
      }

      await db.collections.tier_definitions.remove(id);
      await writeAuditLog('tier_definitions', id, 'delete', source, undefined, db);
    },
    { label: 'LinguisticService.removeTierDefinition' },
  );
  return { errors: [] };
}

export async function getTierAnnotations(tierId: string): Promise<TierAnnotationDocType[]> {
  const db = await getDb();
  const docs = await db.collections.tier_annotations.findByIndex('tierId', tierId);
  return docs.map((doc) => doc.toJSON());
}

async function loadTierGraph(textId: string) {
  const db = await getDb();
  const tierDocs = await db.collections.tier_definitions.findByIndex('textId', textId);
  const tiers = tierDocs.map((doc) => doc.toJSON());
  const tierIds = tiers.map((tier) => tier.id);
  const annotationDocs = await db.collections.tier_annotations.findByIndexAnyOf('tierId', tierIds);
  const annotations = annotationDocs.map((doc) => doc.toJSON());
  return { tiers, annotations };
}

async function persistTierAnnotation(data: TierAnnotationDocType, source: AuditSource, mediaId?: string): Promise<string> {
  const db = await getDb();
  let normalizedData = normalizeTierAnnotationDocForStorage(data, {
    actorType: source === 'ai' ? 'ai' : source === 'system' ? 'system' : 'human',
    method: source === 'ai' ? 'auto-gloss' : source === 'system' ? 'migration' : 'manual',
  });

  assertStableId(normalizedData.id, 'tier annotation');
  assertReviewProtection(normalizedData.provenance?.reviewStatus, source);

  if (mediaId && normalizedData.startTime !== undefined && normalizedData.endTime !== undefined) {
    const now = new Date().toISOString();
    const startTime = normalizedData.startTime;
    const endTime = normalizedData.endTime;
    if (!normalizedData.startAnchorId) {
      const startAnchor: AnchorDocType = { id: newId('anc'), mediaId, time: startTime, createdAt: now };
      await db.dexie.anchors.put(startAnchor);
      normalizedData = { ...normalizedData, startAnchorId: startAnchor.id };
    }
    if (!normalizedData.endAnchorId) {
      const endAnchor: AnchorDocType = { id: newId('anc'), mediaId, time: endTime, createdAt: now };
      await db.dexie.anchors.put(endAnchor);
      normalizedData = { ...normalizedData, endAnchorId: endAnchor.id };
    }
  }

  const existing = await db.dexie.tier_annotations.get(normalizedData.id);
  await db.dexie.tier_annotations.put(normalizedData);
  if (existing) {
    const changes = diffTrackedFields('tier_annotations', existing as unknown as Record<string, unknown>, normalizedData as unknown as Record<string, unknown>);
    if (changes.length > 0) {
      await writeAuditLog('tier_annotations', normalizedData.id, 'update', source, changes, db);
    }
  } else {
    await writeAuditLog('tier_annotations', normalizedData.id, 'create', source, undefined, db);
  }
  return normalizedData.id;
}

async function persistTierAnnotationAtomic(
  data: TierAnnotationDocType,
  source: AuditSource,
  mediaId?: string,
): Promise<string> {
  const db = await getDb();
  return withTransaction(
    db,
    'rw',
    [...dexieStoresForTierAnnotationAtomicRw(db)],
    async () => persistTierAnnotation(data, source, mediaId),
    { label: 'LinguisticService.persistTierAnnotationAtomic' },
  );
}

export async function saveTierAnnotation(data: TierAnnotationDocType, source: AuditSource = 'human'): Promise<TierSaveResult> {
  const db = await getDb();
  const tierDoc = await db.collections.tier_definitions.findOne({ selector: { id: data.tierId } }).exec();
  if (!tierDoc) {
    return {
      id: '',
      errors: [{ rule: 'R2', severity: 'error', tierId: data.tierId, annotationId: data.id, message: `Annotation references non-existent tier "${data.tierId}".` }],
      warnings: [],
    };
  }

  const textId = tierDoc.toJSON().textId;
  const mediaItems = await db.collections.media_items.findByIndex('textId', textId);
  const mediaId = mediaItems[0]?.toJSON().id;
  const { tiers, annotations: existingAnnotations } = await loadTierGraph(textId);
  const merged = new Map(existingAnnotations.map((annotation) => [annotation.id, annotation]));
  merged.set(data.id, data);

  const violations = validateTierConstraints(tiers, [...merged.values()]);
  const errors = violations.filter((violation) => violation.severity === 'error');
  if (errors.length > 0) {
    return { id: '', errors, warnings: [] };
  }

  const id = await persistTierAnnotationAtomic(data, source, mediaId);
  const warnings = violations.filter((violation) => violation.severity === 'warning');
  return { id, errors: [], warnings };
}

export async function removeTierAnnotation(id: string, source: AuditSource = 'human'): Promise<void> {
  const db = await getDb();
  await withTransaction(
    db,
    'rw',
    [...dexieStoresForTierAnnotationAtomicRw(db)],
    async () => {
      const orderedIds: string[] = [];
      const stack = [id];
      const seen = new Set<string>();

      while (stack.length > 0) {
        const currentId = stack.pop()!;
        if (seen.has(currentId)) continue;
        seen.add(currentId);
        orderedIds.push(currentId);
        const children = await db.dexie.tier_annotations.where('parentAnnotationId').equals(currentId).toArray();
        for (const child of children) {
          if (!seen.has(child.id)) stack.push(child.id);
        }
      }

      const rows = (await db.dexie.tier_annotations.bulkGet(orderedIds)).filter((row): row is TierAnnotationDocType => Boolean(row));
      const anchorIds = [...new Set(rows.flatMap((row) => [row.startAnchorId, row.endAnchorId].filter((value): value is string => Boolean(value))))];

      if (anchorIds.length > 0) {
        await db.dexie.anchors.bulkDelete(anchorIds);
      }
      if (orderedIds.length > 0) {
        await db.dexie.tier_annotations.bulkDelete(orderedIds);
      }
      for (const annotationId of orderedIds) {
        await writeAuditLog('tier_annotations', annotationId, 'delete', source, undefined, db);
      }
    },
    { label: 'LinguisticService.removeTierAnnotation' },
  );
}

export async function saveTierAnnotationsBatch(
  textId: string,
  newAnnotations: readonly TierAnnotationDocType[],
): Promise<{ violations: ConstraintViolation[]; warnings: ConstraintViolation[] }> {
  const { tiers, annotations: existingAnnotations } = await loadTierGraph(textId);
  const db = await getDb();
  const mediaItems = await db.collections.media_items.findByIndex('textId', textId);
  const mediaId = mediaItems[0]?.toJSON().id;

  const merged = new Map(existingAnnotations.map((annotation) => [annotation.id, annotation]));
  for (const annotation of newAnnotations) {
    merged.set(annotation.id, annotation);
  }

  const allViolations = validateTierConstraints(tiers, [...merged.values()]);
  const errors = allViolations.filter((violation) => violation.severity === 'error');
  if (errors.length > 0) {
    return { violations: errors, warnings: [] };
  }

  await withTransaction(
    db,
    'rw',
    [...dexieStoresForTierAnnotationAtomicRw(db)],
    async () => {
      for (const annotation of newAnnotations) {
        await persistTierAnnotation(annotation, 'human', mediaId);
      }
    },
    { label: 'LinguisticService.saveTierAnnotationsBatch' },
  );

  const warnings = allViolations.filter((violation) => violation.severity === 'warning');
  return { violations: [], warnings };
}

export async function getAuditLogs(documentId: string): Promise<AuditLogDocType[]> {
  const db = await getDb();
  const docs = await db.collections.audit_logs.findByIndex('documentId', documentId);
  return docs.map((doc) => doc.toJSON()).sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export async function getAuditLogsByCollection(collection: string): Promise<AuditLogDocType[]> {
  const db = await getDb();
  const docs = await db.collections.audit_logs.findByIndex('collection', collection);
  return docs.map((doc) => doc.toJSON()).sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export async function pruneAuditLogs(maxAgeDays: number = 90): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
  const old = await db.dexie.audit_logs.where('timestamp').below(cutoff).primaryKeys();
  await db.dexie.audit_logs.bulkDelete(old);
  return old.length;
}