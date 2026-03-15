import {
  getDb,
  exportDatabaseAsJson,
  importDatabaseFromJson,
  type ImportConflictStrategy,
  type ImportResult,
  type UtteranceDocType,
  type LexemeDocType,
  type TranslationLayerDocType,
  type UtteranceTranslationDocType,
  type TextDocType,
  type MediaItemDocType,
  type TierDefinitionDocType,
  type TierAnnotationDocType,
  type TierType,
  type AuditLogDocType,
  type AuditSource,
} from '../db';

// ── Constraint violation types ──────────────────────────────

export type ConstraintSeverity = 'error' | 'warning' | 'info';

export interface ConstraintViolation {
  rule: string;
  severity: ConstraintSeverity;
  tierId: string;
  annotationId?: string;
  message: string;
}

// ── Allowed parent tier-type map ──────────────────────────────
// What tier types each tier type is allowed to reference as parent.
const ALLOWED_PARENT_TIER_TYPES: Record<TierType, readonly TierType[]> = {
  'time-aligned': [],
  'time-subdivision': ['time-aligned', 'time-subdivision'],
  'symbolic-subdivision': ['time-aligned', 'time-subdivision', 'symbolic-subdivision'],
  'symbolic-association': ['time-aligned', 'time-subdivision', 'symbolic-subdivision', 'symbolic-association'],
};

// ── Pure constraint validation functions ──────────────────────

export function validateTierConstraints(
  tiers: readonly TierDefinitionDocType[],
  annotations: readonly TierAnnotationDocType[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const annotationById = new Map(annotations.map((a) => [a.id, a]));
  const annotationsByTier = new Map<string, TierAnnotationDocType[]>();

  for (const a of annotations) {
    let list = annotationsByTier.get(a.tierId);
    if (!list) {
      list = [];
      annotationsByTier.set(a.tierId, list);
    }
    list.push(a);
  }

  // ── R1: tier-parent-valid ─────────────────────────────────
  // Every tier's parentTierId must reference an existing tier.
  for (const tier of tiers) {
    if (tier.parentTierId !== undefined && !tierById.has(tier.parentTierId)) {
      violations.push({
        rule: 'R1',
        severity: 'error',
        tierId: tier.id,
        message: `Tier "${tier.key}" references non-existent parent tier "${tier.parentTierId}".`,
      });
    }
  }

  // ── R2: annotation-tier-valid ─────────────────────────────
  // Every annotation's tierId must reference an existing tier.
  for (const ann of annotations) {
    if (!tierById.has(ann.tierId)) {
      violations.push({
        rule: 'R2',
        severity: 'error',
        tierId: ann.tierId,
        annotationId: ann.id,
        message: `Annotation "${ann.id}" references non-existent tier "${ann.tierId}".`,
      });
    }
  }

  // ── S5: tier-dag-acyclic ──────────────────────────────────
  // Tier parent hierarchy must not contain cycles.
  for (const tier of tiers) {
    const visited = new Set<string>();
    let current: string | undefined = tier.id;
    while (current !== undefined) {
      if (visited.has(current)) {
        violations.push({
          rule: 'S5',
          severity: 'error',
          tierId: tier.id,
          message: `Tier "${tier.key}" is part of a parent-reference cycle.`,
        });
        break;
      }
      visited.add(current);
      const def = tierById.get(current);
      current = def?.parentTierId;
    }
  }

  // ── S6: tier-parent-type-compatible ───────────────────────
  // A tier's tierType must be compatible with its parent's tierType.
  for (const tier of tiers) {
    if (tier.parentTierId === undefined) continue;
    const parent = tierById.get(tier.parentTierId);
    if (!parent) continue; // Already caught by R1
    const allowed = ALLOWED_PARENT_TIER_TYPES[tier.tierType];
    if (!allowed.includes(parent.tierType)) {
      violations.push({
        rule: 'S6',
        severity: 'error',
        tierId: tier.id,
        message: `Tier "${tier.key}" (${tier.tierType}) cannot have parent "${parent.key}" (${parent.tierType}).`,
      });
    }
  }

  // Per-tier annotation rules
  for (const tier of tiers) {
    const tierAnns = annotationsByTier.get(tier.id) ?? [];
    const isTimeRoot = tier.tierType === 'time-aligned';
    const isTimeSub = tier.tierType === 'time-subdivision';
    const isSymbolic = tier.tierType === 'symbolic-subdivision' || tier.tierType === 'symbolic-association';

    // ── T1: time-bounds ─────────────────────────────────────
    // Time-bearing annotations must have 0 <= startTime <= endTime.
    if (isTimeRoot || isTimeSub) {
      for (const ann of tierAnns) {
        if (ann.startTime === undefined || ann.endTime === undefined) {
          violations.push({
            rule: 'T1',
            severity: 'error',
            tierId: tier.id,
            annotationId: ann.id,
            message: `Annotation "${ann.id}" on time tier "${tier.key}" is missing start/end time.`,
          });
        } else if (ann.startTime < 0 || ann.endTime < ann.startTime) {
          violations.push({
            rule: 'T1',
            severity: 'error',
            tierId: tier.id,
            annotationId: ann.id,
            message: `Annotation "${ann.id}" has invalid time range [${ann.startTime}, ${ann.endTime}].`,
          });
        }
      }
    }

    // ── T2: no-overlap ──────────────────────────────────────
    // Annotations on the same time-aligned tier must not overlap.
    if (isTimeRoot) {
      const sorted = tierAnns
        .filter((a) => a.startTime !== undefined && a.endTime !== undefined)
        .sort((a, b) => a.startTime! - b.startTime!);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!;
        const curr = sorted[i]!;
        if (curr.startTime! < prev.endTime!) {
          violations.push({
            rule: 'T2',
            severity: 'error',
            tierId: tier.id,
            annotationId: curr.id,
            message: `Annotation "${curr.id}" overlaps with "${prev.id}" on tier "${tier.key}".`,
          });
        }
      }
    }

    // ── T3: subdivision-within-parent ───────────────────────
    // Time-subdivision annotations must fall within their parent annotation's time range.
    if (isTimeSub && tier.parentTierId !== undefined) {
      for (const ann of tierAnns) {
        if (ann.startTime === undefined || ann.endTime === undefined || ann.parentAnnotationId === undefined) continue;
        const parentAnn = annotationById.get(ann.parentAnnotationId);
        if (!parentAnn || parentAnn.startTime === undefined || parentAnn.endTime === undefined) continue;
        if (ann.startTime < parentAnn.startTime || ann.endTime > parentAnn.endTime) {
          violations.push({
            rule: 'T3',
            severity: 'error',
            tierId: tier.id,
            annotationId: ann.id,
            message: `Annotation "${ann.id}" [${ann.startTime}, ${ann.endTime}] exceeds parent "${parentAnn.id}" bounds [${parentAnn.startTime}, ${parentAnn.endTime}].`,
          });
        }
      }
    }

    // ── T4: subdivision-full-coverage ───────────────────────
    // Time-subdivision children should fully cover the parent annotation's span (warning).
    if (isTimeSub && tier.parentTierId !== undefined) {
      const childrenByParent = new Map<string, TierAnnotationDocType[]>();
      for (const ann of tierAnns) {
        if (ann.parentAnnotationId === undefined) continue;
        let list = childrenByParent.get(ann.parentAnnotationId);
        if (!list) {
          list = [];
          childrenByParent.set(ann.parentAnnotationId, list);
        }
        list.push(ann);
      }
      for (const [parentId, children] of childrenByParent) {
        const parentAnn = annotationById.get(parentId);
        if (!parentAnn || parentAnn.startTime === undefined || parentAnn.endTime === undefined) continue;
        const validChildren = children
          .filter((c) => c.startTime !== undefined && c.endTime !== undefined)
          .sort((a, b) => a.startTime! - b.startTime!);
        if (validChildren.length === 0) continue;
        const minStart = validChildren[0]!.startTime!;
        const maxEnd = validChildren[validChildren.length - 1]!.endTime!;
        if (minStart > parentAnn.startTime || maxEnd < parentAnn.endTime) {
          violations.push({
            rule: 'T4',
            severity: 'warning',
            tierId: tier.id,
            message: `Subdivisions of parent "${parentId}" on tier "${tier.key}" do not fully cover [${parentAnn.startTime}, ${parentAnn.endTime}].`,
          });
        }
      }
    }

    // ── T5: subdivision-no-overlap ──────────────────────────
    // Time-subdivision children of the same parent must not overlap.
    if (isTimeSub && tier.parentTierId !== undefined) {
      const childrenByParent = new Map<string, TierAnnotationDocType[]>();
      for (const ann of tierAnns) {
        if (ann.parentAnnotationId === undefined) continue;
        let list = childrenByParent.get(ann.parentAnnotationId);
        if (!list) {
          list = [];
          childrenByParent.set(ann.parentAnnotationId, list);
        }
        list.push(ann);
      }
      for (const [, children] of childrenByParent) {
        const sorted = children
          .filter((c) => c.startTime !== undefined && c.endTime !== undefined)
          .sort((a, b) => a.startTime! - b.startTime!);
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1]!;
          const curr = sorted[i]!;
          if (curr.startTime! < prev.endTime!) {
            violations.push({
              rule: 'T5',
              severity: 'error',
              tierId: tier.id,
              annotationId: curr.id,
              message: `Subdivision "${curr.id}" overlaps with "${prev.id}" under the same parent on tier "${tier.key}".`,
            });
          }
        }
      }
    }

    // ── T6: no-time-on-symbolic ─────────────────────────────
    // Symbolic tier annotations must not carry startTime/endTime.
    if (isSymbolic) {
      for (const ann of tierAnns) {
        if (ann.startTime !== undefined || ann.endTime !== undefined) {
          violations.push({
            rule: 'T6',
            severity: 'error',
            tierId: tier.id,
            annotationId: ann.id,
            message: `Symbolic annotation "${ann.id}" on tier "${tier.key}" must not have time values.`,
          });
        }
      }
    }

    // ── S1: parent-annotation-exists ────────────────────────
    // subdivision/association annotations must reference an existing parent annotation.
    if (tier.parentTierId !== undefined) {
      for (const ann of tierAnns) {
        if (ann.parentAnnotationId === undefined) {
          violations.push({
            rule: 'S1',
            severity: 'error',
            tierId: tier.id,
            annotationId: ann.id,
            message: `Annotation "${ann.id}" on child tier "${tier.key}" has no parentAnnotationId.`,
          });
        } else if (!annotationById.has(ann.parentAnnotationId)) {
          violations.push({
            rule: 'S1',
            severity: 'error',
            tierId: tier.id,
            annotationId: ann.id,
            message: `Annotation "${ann.id}" references non-existent parent annotation "${ann.parentAnnotationId}".`,
          });
        }
      }
    }

    // ── S2: tier-type-match ─────────────────────────────────
    // Parent annotation must belong to the tier's parent tier.
    if (tier.parentTierId !== undefined) {
      for (const ann of tierAnns) {
        if (ann.parentAnnotationId === undefined) continue;
        const parentAnn = annotationById.get(ann.parentAnnotationId);
        if (parentAnn && parentAnn.tierId !== tier.parentTierId) {
          violations.push({
            rule: 'S2',
            severity: 'error',
            tierId: tier.id,
            annotationId: ann.id,
            message: `Annotation "${ann.id}" parentAnnotation belongs to tier "${parentAnn.tierId}" but expected "${tier.parentTierId}".`,
          });
        }
      }
    }

    // ── S3: one-to-one (symbolic-association only) ──────────
    // Each parent annotation may have at most one symbolic-association child per tier.
    if (tier.tierType === 'symbolic-association') {
      const parentCounts = new Map<string, string[]>();
      for (const ann of tierAnns) {
        if (ann.parentAnnotationId === undefined) continue;
        let list = parentCounts.get(ann.parentAnnotationId);
        if (!list) {
          list = [];
          parentCounts.set(ann.parentAnnotationId, list);
        }
        list.push(ann.id);
      }
      for (const [parentId, children] of parentCounts) {
        if (children.length > 1) {
          for (const childId of children.slice(1)) {
            violations.push({
              rule: 'S3',
              severity: 'error',
              tierId: tier.id,
              annotationId: childId,
              message: `Symbolic-association tier "${tier.key}" has multiple annotations for parent "${parentId}".`,
            });
          }
        }
      }
    }

    // ── L4: morph-gloss-alignment ───────────────────────────
    // For each parent annotation, the number of symbolic-subdivision children
    // should equal the number of symbolic-association children on sibling tiers
    // (e.g. morpheme count should match gloss count).
    if (tier.tierType === 'symbolic-subdivision' && tier.parentTierId !== undefined) {
      // Find sibling association tiers that share the same parent tier
      const siblingAssocTiers = tiers.filter(
        (t) => t.parentTierId === tier.id && t.tierType === 'symbolic-association',
      );
      if (siblingAssocTiers.length > 0) {
        // Count subdivision children per parent annotation
        const subCountByParent = new Map<string, number>();
        for (const ann of tierAnns) {
          if (ann.parentAnnotationId === undefined) continue;
          subCountByParent.set(ann.parentAnnotationId, (subCountByParent.get(ann.parentAnnotationId) ?? 0) + 1);
        }
        for (const assocTier of siblingAssocTiers) {
          const assocAnns = annotationsByTier.get(assocTier.id) ?? [];
          // Count association children per parent (which is a subdivision annotation)
          const assocCountByParent = new Map<string, number>();
          for (const ann of assocAnns) {
            if (ann.parentAnnotationId === undefined) continue;
            assocCountByParent.set(ann.parentAnnotationId, (assocCountByParent.get(ann.parentAnnotationId) ?? 0) + 1);
          }
          // For each parent of the subdivision tier, check alignment
          for (const [parentId, subCount] of subCountByParent) {
            // Each subdivision annotation under this parent should have exactly one association child
            const subAnnsForParent = tierAnns.filter((a) => a.parentAnnotationId === parentId);
            let assocTotal = 0;
            for (const subAnn of subAnnsForParent) {
              assocTotal += assocCountByParent.get(subAnn.id) ?? 0;
            }
            if (assocTotal > 0 && assocTotal !== subCount) {
              violations.push({
                rule: 'L4',
                severity: 'warning',
                tierId: assocTier.id,
                message: `Tier "${assocTier.key}" has ${assocTotal} annotations but subdivision tier "${tier.key}" has ${subCount} segments under parent "${parentId}".`,
              });
            }
          }
        }
      }
    }
  }

  return violations;
}

// ── Audit log infrastructure ──────────────────────────────────

/** Fields tracked per collection. Only changes to these fields generate audit entries. */
const TRACKED_FIELDS: Record<string, readonly string[]> = {
  tier_annotations: ['value', 'startTime', 'endTime', 'isVerified', 'parentAnnotationId'],
  tier_definitions: ['parentTierId', 'tierType', 'contentType', 'name'],
  utterances: ['transcription', 'startTime', 'endTime', 'isVerified'],
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
): Promise<void> {
  const db = await getDb();
  const timestamp = new Date().toISOString();

  if (action === 'create' || action === 'delete' || !changes || changes.length === 0) {
    await db.collections.audit_logs.insert({
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
    await db.collections.audit_logs.insert({
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

export class LinguisticService {
  static async getAllUtterances(): Promise<UtteranceDocType[]> {
    const db = await getDb();
    const docs = await db.collections.utterances.find().exec();
    return docs.map((doc) => doc.toJSON());
  }

  static async getUtteranceAtTime(time: number): Promise<UtteranceDocType | undefined> {
    const db = await getDb();
    const docs = await db.collections.utterances.find().exec();
    return docs.map((doc) => doc.toJSON()).find((u) => u.startTime <= time && u.endTime >= time);
  }

  static async saveUtterance(data: UtteranceDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.utterances.insert(data);
    return doc.primary;
  }

  static async getUtterancesByTextId(textId: string): Promise<UtteranceDocType[]> {
    const db = await getDb();
    const docs = await db.collections.utterances.find().exec();
    return docs.map((doc) => doc.toJSON()).filter((u) => u.textId === textId);
  }

  static async saveUtterancesBatch(items: UtteranceDocType[]): Promise<void> {
    const db = await getDb();
    for (const item of items) {
      await db.collections.utterances.insert(item);
    }
  }

  static async searchLexemes(query: string): Promise<LexemeDocType[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    const db = await getDb();
    const docs = await db.collections.lexemes.find().exec();
    return docs
      .map((doc) => doc.toJSON())
      .filter((item) =>
        Object.values(item.lemma).some((value) => value.toLowerCase().includes(normalized)),
      );
  }

  static async saveLexeme(data: LexemeDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.lexemes.insert(data);
    return doc.primary;
  }

  static async getTranslationLayers(
    layerType?: TranslationLayerDocType['layerType'],
  ): Promise<TranslationLayerDocType[]> {
    const db = await getDb();
    const docs = await db.collections.translation_layers.find().exec();
    const all = docs.map((doc) => doc.toJSON());
    if (!layerType) return all;
    return all.filter((layer) => layer.layerType === layerType);
  }

  static async saveTranslationLayer(data: TranslationLayerDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.translation_layers.insert(data);
    return doc.primary;
  }

  static async getUtteranceTranslations(utteranceId: string): Promise<UtteranceTranslationDocType[]> {
    const db = await getDb();
    const docs = await db.collections.utterance_translations.find().exec();
    return docs.map((doc) => doc.toJSON()).filter((item) => item.utteranceId === utteranceId);
  }

  static async saveUtteranceTranslation(data: UtteranceTranslationDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.utterance_translations.insert(data);
    return doc.primary;
  }

  static async getAllTexts(): Promise<TextDocType[]> {
    const db = await getDb();
    const docs = await db.collections.texts.find().exec();
    return docs.map((doc) => doc.toJSON());
  }

  static async saveText(data: TextDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.texts.insert(data);
    return doc.primary;
  }

  static async getMediaItemsByTextId(textId: string): Promise<MediaItemDocType[]> {
    const db = await getDb();
    const docs = await db.collections.media_items.find().exec();
    return docs.map((doc) => doc.toJSON()).filter((item) => item.textId === textId);
  }

  static async saveMediaItem(data: MediaItemDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.media_items.insert(data);
    return doc.primary;
  }

  static async exportToJSON(): Promise<string> {
    const snapshot = await exportDatabaseAsJson();
    return JSON.stringify(snapshot, null, 2);
  }

  static async importFromJSON(
    payload: string,
    strategy: ImportConflictStrategy = 'upsert',
  ): Promise<ImportResult> {
    return importDatabaseFromJson(payload, { strategy });
  }

  // ── Tier definition CRUD ───────────────────────────────────

  static async getTierDefinitions(textId: string): Promise<TierDefinitionDocType[]> {
    const db = await getDb();
    const docs = await db.collections.tier_definitions.find().exec();
    return docs.map((doc) => doc.toJSON()).filter((t) => t.textId === textId);
  }

  static async saveTierDefinition(data: TierDefinitionDocType, source: AuditSource = 'human'): Promise<string> {
    const db = await getDb();
    const existing = await db.collections.tier_definitions.findOne({ selector: { id: data.id } as any }).exec();
    const doc = await db.collections.tier_definitions.insert(data);
    if (existing) {
      const changes = diffTrackedFields('tier_definitions', existing.toJSON() as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
      if (changes.length > 0) {
        await writeAuditLog('tier_definitions', data.id, 'update', source, changes);
      }
    } else {
      await writeAuditLog('tier_definitions', data.id, 'create', source);
    }
    return doc.primary;
  }

  static async removeTierDefinition(id: string, source: AuditSource = 'human'): Promise<void> {
    const db = await getDb();
    await db.collections.tier_definitions.remove(id);
    await writeAuditLog('tier_definitions', id, 'delete', source);
  }

  // ── Tier annotation CRUD ───────────────────────────────────

  static async getTierAnnotations(tierId: string): Promise<TierAnnotationDocType[]> {
    const db = await getDb();
    const docs = await db.collections.tier_annotations.find().exec();
    return docs.map((doc) => doc.toJSON()).filter((a) => a.tierId === tierId);
  }

  static async saveTierAnnotation(data: TierAnnotationDocType, source: AuditSource = 'human'): Promise<string> {
    const db = await getDb();
    const existing = await db.collections.tier_annotations.findOne({ selector: { id: data.id } as any }).exec();
    const doc = await db.collections.tier_annotations.insert(data);
    if (existing) {
      const changes = diffTrackedFields('tier_annotations', existing.toJSON() as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
      if (changes.length > 0) {
        await writeAuditLog('tier_annotations', data.id, 'update', source, changes);
      }
    } else {
      await writeAuditLog('tier_annotations', data.id, 'create', source);
    }
    return doc.primary;
  }

  static async removeTierAnnotation(id: string, source: AuditSource = 'human'): Promise<void> {
    const db = await getDb();
    await db.collections.tier_annotations.remove(id);
    await writeAuditLog('tier_annotations', id, 'delete', source);
  }

  // ── Batch save with constraint validation ──────────────────

  static async saveTierAnnotationsBatch(
    textId: string,
    newAnnotations: readonly TierAnnotationDocType[],
  ): Promise<{ violations: ConstraintViolation[] }> {
    const db = await getDb();

    // Load current tier graph
    const tierDocs = await db.collections.tier_definitions.find().exec();
    const tiers = tierDocs.map((d) => d.toJSON()).filter((t) => t.textId === textId);
    const tierIds = new Set(tiers.map((t) => t.id));

    // Load existing annotations for relevant tiers
    const existingDocs = await db.collections.tier_annotations.find().exec();
    const existingAnns = existingDocs.map((d) => d.toJSON()).filter((a) => tierIds.has(a.tierId));

    // Merge: new annotations override existing ones with same id
    const merged = new Map(existingAnns.map((a) => [a.id, a]));
    for (const ann of newAnnotations) {
      merged.set(ann.id, ann);
    }

    // Validate
    const violations = validateTierConstraints(tiers, [...merged.values()]);
    const errors = violations.filter((v) => v.severity === 'error');
    if (errors.length > 0) {
      return { violations: errors };
    }

    // Persist + audit
    for (const ann of newAnnotations) {
      await this.saveTierAnnotation(ann, 'human');
    }

    return { violations: [] };
  }

  // ── Audit log queries ──────────────────────────────────────

  static async getAuditLogs(documentId: string): Promise<AuditLogDocType[]> {
    const db = await getDb();
    const docs = await db.collections.audit_logs.find().exec();
    return docs
      .map((d) => d.toJSON())
      .filter((log) => log.documentId === documentId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  static async getAuditLogsByCollection(collection: string): Promise<AuditLogDocType[]> {
    const db = await getDb();
    const docs = await db.collections.audit_logs.find().exec();
    return docs
      .map((d) => d.toJSON())
      .filter((log) => log.collection === collection)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  // ── Project initialization ─────────────────────────────────

  static async createProject(input: {
    titleZh: string;
    titleEn: string;
    primaryLanguageId: string;
  }): Promise<{ textId: string }> {
    const db = await getDb();
    const now = new Date().toISOString();
    const textId = `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await db.collections.texts.insert({
      id: textId,
      title: { zho: input.titleZh, eng: input.titleEn },
      metadata: { primaryLanguageId: input.primaryLanguageId },
      createdAt: now,
      updatedAt: now,
    } as TextDocType);

    return { textId };
  }

  // ── Audio import ───────────────────────────────────────────

  static async importAudio(input: {
    textId: string;
    audioBlob: Blob;
    filename: string;
    duration: number;
  }): Promise<{ mediaId: string }> {
    const db = await getDb();
    const now = new Date().toISOString();
    const mediaId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await db.collections.media_items.insert({
      id: mediaId,
      textId: input.textId,
      filename: input.filename,
      duration: input.duration,
      details: { audioBlob: input.audioBlob },
      isOfflineCached: true,
      createdAt: now,
    });

    return { mediaId };
  }

  /** Delete a project (text) and all associated data (cascade). */
  static async deleteProject(textId: string): Promise<void> {
    const db = await getDb();

    // Collect utterance IDs so we can cascade to translations
    const allUtts = await db.collections.utterances.find().exec();
    const uttIds = allUtts
      .map((d) => d.toJSON() as { id: string; textId: string })
      .filter((u) => u.textId === textId)
      .map((u) => u.id);

    // Cascade: utterance_translations for these utterances
    for (const uttId of uttIds) {
      await db.collections.utterance_translations.removeBySelector(
        { utteranceId: uttId } as never,
      );
    }

    // Cascade: tier_annotations belonging to tier_definitions of this text
    const allTierDefs = await db.collections.tier_definitions.find().exec();
    const tierDefIds = allTierDefs
      .map((d) => d.toJSON() as { id: string; textId: string })
      .filter((td) => td.textId === textId)
      .map((td) => td.id);

    for (const tdId of tierDefIds) {
      await db.collections.tier_annotations.removeBySelector(
        { tierId: tdId } as never,
      );
    }

    await db.collections.tier_definitions.removeBySelector({ textId } as never);
    await db.collections.utterances.removeBySelector({ textId } as never);
    await db.collections.media_items.removeBySelector({ textId } as never);
    await db.collections.texts.remove(textId);
  }

  /** Delete a media item and its associated utterances + translations (cascade). */
  static async deleteAudio(mediaId: string): Promise<void> {
    const db = await getDb();

    // Find utterances linked to this media
    const allUtts = await db.collections.utterances.find().exec();
    const uttIds = allUtts
      .map((d) => d.toJSON() as { id: string; mediaId?: string })
      .filter((u) => u.mediaId === mediaId)
      .map((u) => u.id);

    // Cascade: utterance_translations
    for (const uttId of uttIds) {
      await db.collections.utterance_translations.removeBySelector(
        { utteranceId: uttId } as never,
      );
    }

    await db.collections.utterances.removeBySelector({ mediaId } as never);
    await db.collections.media_items.remove(mediaId);
  }

  /** Delete a single utterance and cascade-delete its translations + lexicon links. */
  static async removeUtterance(utteranceId: string): Promise<void> {
    const db = await getDb();
    await db.collections.utterance_translations.removeBySelector(
      { utteranceId } as never,
    );
    await db.collections.corpus_lexicon_links.removeBySelector(
      { utteranceId } as never,
    );
    await db.collections.utterances.remove(utteranceId);
  }
}
