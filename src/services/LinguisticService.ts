import {
  getDb,
  exportDatabaseAsJson,
  importDatabaseFromJson,
  type ImportConflictStrategy,
  type ImportResult,
  type UtteranceDocType,
  type UtteranceTokenDocType,
  type UtteranceMorphemeDocType,
  type TokenLexemeLinkDocType,
  type TokenLexemeLinkTargetType,
  type LexemeDocType,
  type TranslationLayerDocType,
  type UtteranceTextDocType,
  type TextDocType,
  type MediaItemDocType,
  type TierDefinitionDocType,
  type TierAnnotationDocType,
  type TierType,
  type AuditLogDocType,
  type AuditSource,
  type AnchorDocType,
  type SpeakerDocType,
} from '../../db';
import { newId } from '../../src/utils/transcriptionFormatters';
import {
  assertReviewProtection,
  assertStableId,
  normalizeTierAnnotationDocForStorage,
  normalizeUtteranceDocForStorage,
  normalizeUtteranceTextDocForStorage,
} from '../../src/utils/camDataUtils';

// ── Constraint violation types ──────────────────────────────

export type ConstraintSeverity = 'error' | 'warning' | 'info';

export interface ConstraintViolation {
  rule: string;
  severity: ConstraintSeverity;
  tierId: string;
  annotationId?: string;
  message: string;
}

/** Result returned by validated tier save operations. */
export interface TierSaveResult {
  /** Saved document ID (empty string if save was rejected). */
  id: string;
  /** Error-level violations that blocked the save (non-empty ⇒ id is ''). */
  errors: ConstraintViolation[];
  /** Warning-level violations (informational, save still proceeded). */
  warnings: ConstraintViolation[];
}

export interface ImportQualityReport {
  generatedAt: string;
  scope: {
    textId?: string;
  };
  totals: {
    utterances: number;
    utteranceTexts: number;
    transcriptionLayers: number;
    translationLayers: number;
    canonicalTokens: number;
    canonicalMorphemes: number;
    userNotes: number;
  };
  coverage: {
    transcribedUtterances: number;
    translatedUtterances: number;
    glossedUtterances: number;
    verifiedUtterances: number;
    transcribedRate: number;
    translatedRate: number;
    glossedRate: number;
    verifiedRate: number;
  };
  integrity: {
    orphanNotes: number;
    orphanAnchors: number;
  };
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
  tier_annotations: ['value', 'startTime', 'endTime', 'startAnchorId', 'endAnchorId', 'isVerified', 'parentAnnotationId'],
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
  private static async removeNotesForUtteranceIds(
    db: Awaited<ReturnType<typeof getDb>>,
    utteranceIds: readonly string[],
  ): Promise<void> {
    const ids = [...new Set(utteranceIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return;

    const tokens = await db.dexie.utterance_tokens.where('utteranceId').anyOf(ids).toArray();
    const morphemes = await db.dexie.utterance_morphemes.where('utteranceId').anyOf(ids).toArray();

    const deleteByTarget = async (targetType: 'utterance' | 'token' | 'morpheme', targetIds: readonly string[]) => {
      if (targetIds.length === 0) return;
      await db.dexie.user_notes
        .where('[targetType+targetId]')
        .anyOf(targetIds.map((targetId) => [targetType, targetId] as [string, string]))
        .delete();
    };

    await deleteByTarget('utterance', ids);
    await deleteByTarget('token', tokens.map((token) => token.id));
    await deleteByTarget('morpheme', morphemes.map((morpheme) => morpheme.id));
  }

  static async generateImportQualityReport(textId?: string): Promise<ImportQualityReport> {
    const db = await getDb();

    const [utterancesAll, utteranceTextsAll, layersAll, tokensAll, morphemesAll, userNotesAll, anchorsAll] = await Promise.all([
      db.dexie.utterances.toArray(),
      db.dexie.utterance_texts.toArray(),
      db.collections.translation_layers.find().exec().then((docs) => docs.map((doc) => doc.toJSON())),
      db.dexie.utterance_tokens.toArray(),
      db.dexie.utterance_morphemes.toArray(),
      db.dexie.user_notes.toArray(),
      db.dexie.anchors.toArray(),
    ]);

    const inScopeUtterances = textId
      ? utterancesAll.filter((u) => u.textId === textId)
      : utterancesAll;
    const inScopeUtteranceIds = new Set(inScopeUtterances.map((u) => u.id));

    const inScopeUtteranceTexts = utteranceTextsAll.filter((row) => inScopeUtteranceIds.has(row.utteranceId));
    const inScopeTokens = tokensAll.filter((row) => inScopeUtteranceIds.has(row.utteranceId));
    const inScopeMorphemes = morphemesAll.filter((row) => inScopeUtteranceIds.has(row.utteranceId));

    const inScopeTokenIds = new Set(inScopeTokens.map((t) => t.id));
    const inScopeMorphemeIds = new Set(inScopeMorphemes.map((m) => m.id));
    const inScopeTranslationIds = new Set(inScopeUtteranceTexts.map((t) => t.id));

    const inScopeNotes = userNotesAll.filter((note) => {
      if (!textId) return true;
      if (note.targetType === 'utterance') return inScopeUtteranceIds.has(note.targetId);
      if (note.targetType === 'translation') return inScopeTranslationIds.has(note.targetId);
      if (note.targetType === 'token') {
        return inScopeTokenIds.has(note.targetId)
          || (typeof note.parentTargetId === 'string' && inScopeUtteranceIds.has(note.parentTargetId));
      }
      if (note.targetType === 'morpheme') {
        return inScopeMorphemeIds.has(note.targetId)
          || (typeof note.parentTargetId === 'string' && inScopeTokenIds.has(note.parentTargetId));
      }
      return false;
    });

    const layerTypeById = new Map(layersAll.map((layer) => [layer.id, layer.layerType] as const));

    const transcribedUttIds = new Set<string>();
    const translatedUttIds = new Set<string>();
    const glossedUttIds = new Set<string>();
    const verifiedUttIds = new Set<string>();

    for (const utt of inScopeUtterances) {
      if (utt.isVerified) verifiedUttIds.add(utt.id);

      const legacyTr = utt.transcription?.default;
      if (typeof legacyTr === 'string' && legacyTr.trim().length > 0) {
        transcribedUttIds.add(utt.id);
      }
    }

    for (const row of inScopeUtteranceTexts) {
      const text = row.text?.trim() ?? '';
      if (!text) continue;
      const layerType = layerTypeById.get(row.tierId);
      if (layerType === 'transcription') transcribedUttIds.add(row.utteranceId);
      if (layerType === 'translation') translatedUttIds.add(row.utteranceId);
    }

    for (const token of inScopeTokens) {
      if (token.gloss && Object.keys(token.gloss).length > 0) {
        glossedUttIds.add(token.utteranceId);
        continue;
      }
      if (token.pos && token.pos.trim().length > 0) {
        glossedUttIds.add(token.utteranceId);
      }
    }
    for (const morph of inScopeMorphemes) {
      if (morph.gloss && Object.keys(morph.gloss).length > 0) {
        glossedUttIds.add(morph.utteranceId);
        continue;
      }
      if (morph.pos && morph.pos.trim().length > 0) {
        glossedUttIds.add(morph.utteranceId);
      }
    }

    const utteranceById = new Set(inScopeUtterances.map((u) => u.id));
    const tokenById = new Set(inScopeTokens.map((u) => u.id));
    const morphemeById = new Set(inScopeMorphemes.map((u) => u.id));
    const translationById = new Set(inScopeUtteranceTexts.map((u) => u.id));

    let orphanNotes = 0;
    for (const note of inScopeNotes) {
      if (note.targetType === 'utterance' && !utteranceById.has(note.targetId)) orphanNotes++;
      if (note.targetType === 'token' && !tokenById.has(note.targetId)) orphanNotes++;
      if (note.targetType === 'morpheme' && !morphemeById.has(note.targetId)) orphanNotes++;
      if (note.targetType === 'translation' && !translationById.has(note.targetId)) orphanNotes++;
    }

    const referencedAnchors = new Set<string>();
    for (const utt of inScopeUtterances) {
      if (utt.startAnchorId) referencedAnchors.add(utt.startAnchorId);
      if (utt.endAnchorId) referencedAnchors.add(utt.endAnchorId);
    }
    let orphanAnchors = 0;
    for (const anchor of anchorsAll) {
      if (!referencedAnchors.has(anchor.id)) orphanAnchors++;
    }

    const totalUtterances = inScopeUtterances.length;
    const ratio = (part: number): number => (totalUtterances === 0 ? 0 : part / totalUtterances);

    const transcriptionLayers = layersAll.filter((l) => l.layerType === 'transcription');
    const translationLayers = layersAll.filter((l) => l.layerType === 'translation');
    const inScopeTextIds = new Set(inScopeUtterances.map((u) => u.textId));

    return {
      generatedAt: new Date().toISOString(),
      scope: textId ? { textId } : {},
      totals: {
        utterances: totalUtterances,
        utteranceTexts: inScopeUtteranceTexts.length,
        transcriptionLayers: transcriptionLayers.filter((l) => inScopeTextIds.has(l.textId)).length,
        translationLayers: translationLayers.filter((l) => inScopeTextIds.has(l.textId)).length,
        canonicalTokens: inScopeTokens.length,
        canonicalMorphemes: inScopeMorphemes.length,
        userNotes: inScopeNotes.length,
      },
      coverage: {
        transcribedUtterances: transcribedUttIds.size,
        translatedUtterances: translatedUttIds.size,
        glossedUtterances: glossedUttIds.size,
        verifiedUtterances: verifiedUttIds.size,
        transcribedRate: ratio(transcribedUttIds.size),
        translatedRate: ratio(translatedUttIds.size),
        glossedRate: ratio(glossedUttIds.size),
        verifiedRate: ratio(verifiedUttIds.size),
      },
      integrity: {
        orphanNotes,
        orphanAnchors,
      },
    };
  }

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

  static async getSpeakers(): Promise<SpeakerDocType[]> {
    const db = await getDb();
    const docs = await db.collections.speakers.find().exec();
    return docs
      .map((doc) => doc.toJSON())
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name, 'zh-Hans-CN');
        if (byName !== 0) return byName;
        return a.id.localeCompare(b.id, 'en');
      });
  }

  static async createSpeaker(input: {
    name: string;
    pseudonym?: string;
    role?: SpeakerDocType['role'];
  }): Promise<SpeakerDocType> {
    const db = await getDb();
    const name = input.name.trim();
    if (!name) throw new Error('说话人名称不能为空');

    const normalizedName = name.toLocaleLowerCase('zh-Hans-CN');
    const existingSpeakers = (await db.collections.speakers.find().exec()).map((doc) => doc.toJSON());
    const duplicate = existingSpeakers.find((speaker) => speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName);
    if (duplicate) throw new Error(`说话人已存在: ${duplicate.name}`);

    const now = new Date().toISOString();
    const speaker: SpeakerDocType = {
      id: newId('speaker'),
      name,
      ...(input.pseudonym?.trim() ? { pseudonym: input.pseudonym.trim() } : {}),
      ...(input.role ? { role: input.role } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await db.collections.speakers.insert(speaker);
    return speaker;
  }

  static async renameSpeaker(speakerId: string, nextName: string): Promise<SpeakerDocType> {
    const db = await getDb();
    const id = speakerId.trim();
    const name = nextName.trim();
    if (!id) throw new Error('说话人 ID 不能为空');
    if (!name) throw new Error('说话人名称不能为空');

    const speakerDoc = await db.collections.speakers.findOne({ selector: { id } }).exec();
    if (!speakerDoc) throw new Error(`说话人不存在: ${id}`);

    const normalizedName = name.toLocaleLowerCase('zh-Hans-CN');
    const existingSpeakers = (await db.collections.speakers.find().exec()).map((doc) => doc.toJSON());
    const duplicate = existingSpeakers.find((speaker) => (
      speaker.id !== id && speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName
    ));
    if (duplicate) throw new Error(`说话人已存在: ${duplicate.name}`);

    const current = speakerDoc.toJSON();
    const now = new Date().toISOString();
    const updated: SpeakerDocType = {
      ...current,
      name,
      updatedAt: now,
    };
    await db.collections.speakers.insert(updated);

    const utterances = await db.collections.utterances.findByIndex('speakerId', id);
    if (utterances.length > 0) {
      const normalized = utterances.map((doc) => {
        const row = doc.toJSON();
        return normalizeUtteranceDocForStorage({
          ...row,
          speaker: name,
          updatedAt: now,
        });
      });
      await db.collections.utterances.bulkInsert(normalized);
    }

    return updated;
  }

  static async mergeSpeakers(sourceSpeakerId: string, targetSpeakerId: string): Promise<number> {
    const db = await getDb();
    const sourceId = sourceSpeakerId.trim();
    const targetId = targetSpeakerId.trim();
    if (!sourceId || !targetId) throw new Error('说话人 ID 不能为空');
    if (sourceId === targetId) return 0;

    const [sourceDoc, targetDoc] = await Promise.all([
      db.collections.speakers.findOne({ selector: { id: sourceId } }).exec(),
      db.collections.speakers.findOne({ selector: { id: targetId } }).exec(),
    ]);

    if (!sourceDoc) throw new Error(`来源说话人不存在: ${sourceId}`);
    if (!targetDoc) throw new Error(`目标说话人不存在: ${targetId}`);

    const target = targetDoc.toJSON();
    const now = new Date().toISOString();
    const utterances = await db.collections.utterances.findByIndex('speakerId', sourceId);

    if (utterances.length > 0) {
      const normalized = utterances.map((doc) => {
        const row = doc.toJSON();
        return normalizeUtteranceDocForStorage({
          ...row,
          speakerId: target.id,
          speaker: target.name,
          updatedAt: now,
        });
      });
      await db.collections.utterances.bulkInsert(normalized);
    }

    await db.collections.speakers.remove(sourceId);
    return utterances.length;
  }

  static async deleteSpeaker(
    speakerId: string,
    options: {
      strategy?: 'clear' | 'merge' | 'reject';
      targetSpeakerId?: string;
    } = {},
  ): Promise<number> {
    const db = await getDb();
    const id = speakerId.trim();
    if (!id) throw new Error('说话人 ID 不能为空');

    const strategy = options.strategy ?? 'reject';
    const speakerDoc = await db.collections.speakers.findOne({ selector: { id } }).exec();
    if (!speakerDoc) throw new Error(`说话人不存在: ${id}`);

    const utteranceDocs = await db.collections.utterances.findByIndex('speakerId', id);
    const utterances = utteranceDocs.map((doc) => doc.toJSON());
    const affectedCount = utterances.length;

    if (affectedCount > 0 && strategy === 'reject') {
      throw new Error(`说话人仍被 ${affectedCount} 条句段引用`);
    }

    const now = new Date().toISOString();

    if (affectedCount > 0 && strategy === 'merge') {
      const targetId = options.targetSpeakerId?.trim();
      if (!targetId) throw new Error('删除说话人时未指定迁移目标');
      if (targetId === id) throw new Error('迁移目标不能是当前说话人');
      const targetDoc = await db.collections.speakers.findOne({ selector: { id: targetId } }).exec();
      if (!targetDoc) throw new Error(`目标说话人不存在: ${targetId}`);
      const target = targetDoc.toJSON();

      const normalized = utterances.map((row) => normalizeUtteranceDocForStorage({
        ...row,
        speakerId: target.id,
        speaker: target.name,
        updatedAt: now,
      }));
      await db.collections.utterances.bulkInsert(normalized);
    }

    if (affectedCount > 0 && strategy === 'clear') {
      const normalized = utterances.map((row) => {
        const { speaker: _oldSpeaker, speakerId: _oldSpeakerId, ...rest } = row;
        return normalizeUtteranceDocForStorage({
          ...rest,
          updatedAt: now,
        });
      });
      await db.collections.utterances.bulkInsert(normalized);
    }

    await db.collections.speakers.remove(id);
    return affectedCount;
  }

  static async assignSpeakerToUtterances(
    utteranceIds: Iterable<string>,
    speakerId?: string,
  ): Promise<number> {
    const db = await getDb();
    const ids = [...new Set(Array.from(utteranceIds).map((id) => id.trim()).filter((id) => id.length > 0))];
    if (ids.length === 0) return 0;

    const selectedSpeakerId = speakerId?.trim();
    let speaker: SpeakerDocType | undefined;
    if (selectedSpeakerId) {
      const speakerDoc = await db.collections.speakers.findOne({ selector: { id: selectedSpeakerId } }).exec();
      if (!speakerDoc) {
        throw new Error(`说话人不存在: ${selectedSpeakerId}`);
      }
      speaker = speakerDoc.toJSON();
    }

    const docs = await Promise.all(ids.map((id) => db.collections.utterances.findOne({ selector: { id } }).exec()));
    const rows = docs.filter((doc): doc is NonNullable<typeof doc> => Boolean(doc)).map((doc) => doc.toJSON());
    if (rows.length === 0) return 0;

    const now = new Date().toISOString();
    const updates = rows.map((row) => {
      const { speaker: _oldSpeaker, speakerId: _oldSpeakerId, ...rest } = row;
      return normalizeUtteranceDocForStorage({
        ...rest,
        ...(speaker ? { speaker: speaker.name, speakerId: speaker.id } : {}),
        updatedAt: now,
      });
    });

    await db.collections.utterances.bulkInsert(updates);
    return updates.length;
  }

  static async saveUtterance(data: UtteranceDocType): Promise<string> {
    const db = await getDb();
    const normalized = normalizeUtteranceDocForStorage(data);
    const doc = await db.collections.utterances.insert(normalized);
    return doc.primary;
  }

  static async getUtterancesByTextId(textId: string): Promise<UtteranceDocType[]> {
    const db = await getDb();
    const docs = await db.collections.utterances.findByIndex('textId', textId);
    return docs.map((doc) => doc.toJSON());
  }

  static async saveUtterancesBatch(items: UtteranceDocType[]): Promise<void> {
    const db = await getDb();
    const normalized = items.map(normalizeUtteranceDocForStorage);
    await db.collections.utterances.bulkInsert(normalized);
  }

  static async getTokensByUtteranceId(utteranceId: string): Promise<UtteranceTokenDocType[]> {
    const db = await getDb();
    const docs = await db.collections.utterance_tokens.findByIndex('utteranceId', utteranceId);
    return docs.map((doc) => doc.toJSON()).sort((a, b) => a.tokenIndex - b.tokenIndex);
  }

  static async getMorphemesByTokenId(tokenId: string): Promise<UtteranceMorphemeDocType[]> {
    const db = await getDb();
    const docs = await db.collections.utterance_morphemes.findByIndex('tokenId', tokenId);
    return docs.map((doc) => doc.toJSON()).sort((a, b) => a.morphemeIndex - b.morphemeIndex);
  }

  static async saveToken(data: UtteranceTokenDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.utterance_tokens.insert(data);
    return doc.primary;
  }

  static async saveTokensBatch(items: UtteranceTokenDocType[]): Promise<void> {
    const db = await getDb();
    await db.collections.utterance_tokens.bulkInsert(items);
  }

  static async updateTokenPos(tokenId: string, pos: string | null): Promise<void> {
    const db = await getDb();
    const existing = await db.collections.utterance_tokens
      .findOne({ selector: { id: tokenId } }).exec();
    if (!existing) {
      throw new Error(`未找到 token: ${tokenId}`);
    }

    const row = existing.toJSON();
    const trimmed = (pos ?? '').trim();
    const nextPos = trimmed.length > 0 ? trimmed : undefined;
    const { pos: _oldPos, ...rest } = row;

    await db.collections.utterance_tokens.insert({
      ...rest,
      ...(nextPos ? { pos: nextPos } : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  static async updateTokenGloss(tokenId: string, gloss: string | null, lang = 'eng'): Promise<void> {
    const db = await getDb();
    const existing = await db.collections.utterance_tokens
      .findOne({ selector: { id: tokenId } }).exec();
    if (!existing) {
      throw new Error(`未找到 token: ${tokenId}`);
    }

    const row = existing.toJSON();
    const trimmed = (gloss ?? '').trim();

    let nextGloss: Record<string, string> | undefined;
    if (trimmed.length > 0) {
      nextGloss = { ...(row.gloss ?? {}), [lang]: trimmed };
    } else if (row.gloss) {
      // 清除指定语言的 gloss；若无其他语言则整体清除
      // Remove gloss for this lang; clear entirely if no other langs remain
      const { [lang]: _removed, ...rest } = row.gloss;
      nextGloss = Object.keys(rest).length > 0 ? rest : undefined;
    }

    const { gloss: _oldGloss, ...rest } = row;
    await db.collections.utterance_tokens.insert({
      ...rest,
      ...(nextGloss ? { gloss: nextGloss } : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  static async batchUpdateTokenPosByForm(
    utteranceId: string,
    form: string,
    pos: string | null,
    orthographyKey = 'default',
  ): Promise<number> {
    const db = await getDb();
    const normalizedForm = form.trim();
    if (!normalizedForm) return 0;

    const tokens = await db.collections.utterance_tokens.findByIndex('utteranceId', utteranceId);
    const rows = tokens.map((doc) => doc.toJSON());
    const normalizedPos = (pos ?? '').trim();
    const now = new Date().toISOString();

    const matches = rows.filter((row) => {
      const direct = row.form[orthographyKey];
      if (direct === normalizedForm) return true;
      return Object.values(row.form).some((v) => v === normalizedForm);
    });

    if (matches.length === 0) return 0;

    await db.collections.utterance_tokens.bulkInsert(matches.map((row) => {
      const { pos: _oldPos, ...rest } = row;
      return {
        ...rest,
        ...(normalizedPos ? { pos: normalizedPos } : {}),
        updatedAt: now,
      };
    }));

    return matches.length;
  }

  static async saveMorpheme(data: UtteranceMorphemeDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.utterance_morphemes.insert(data);
    return doc.primary;
  }

  static async saveMorphemesBatch(items: UtteranceMorphemeDocType[]): Promise<void> {
    const db = await getDb();
    await db.collections.utterance_morphemes.bulkInsert(items);
  }

  static async removeToken(tokenId: string): Promise<void> {
    const db = await getDb();
    await db.collections.utterance_morphemes.removeBySelector({ tokenId });
    await db.collections.utterance_tokens.remove(tokenId);
    await db.collections.token_lexeme_links.removeBySelector({ targetType: 'token', targetId: tokenId });
  }

  static async saveTokenLexemeLink(data: TokenLexemeLinkDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.token_lexeme_links.insert(data);
    return doc.primary;
  }

  static async getTokenLexemeLinks(
    targetType: TokenLexemeLinkTargetType,
    targetId: string,
  ): Promise<TokenLexemeLinkDocType[]> {
    const db = await getDb();
    return db.dexie.token_lexeme_links.where('[targetType+targetId]').equals([targetType, targetId]).toArray();
  }

  static async removeTokenLexemeLinks(targetType: TokenLexemeLinkTargetType, targetId: string): Promise<void> {
    const db = await getDb();
    await db.collections.token_lexeme_links.removeBySelector({ targetType, targetId });
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
    textId?: string,
  ): Promise<TranslationLayerDocType[]> {
    const db = await getDb();
    if (textId) {
      const docs = await db.collections.translation_layers.findByIndex('textId', textId);
      const layers = docs.map((doc) => doc.toJSON());
      return layerType ? layers.filter((l) => l.layerType === layerType) : layers;
    }
    if (layerType) {
      const docs = await db.collections.translation_layers.findByIndex('layerType', layerType);
      return docs.map((doc) => doc.toJSON());
    }
    const docs = await db.collections.translation_layers.find().exec();
    return docs.map((doc) => doc.toJSON());
  }

  static async saveTranslationLayer(data: TranslationLayerDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.translation_layers.insert(data);
    return doc.primary;
  }

  static async getUtteranceTexts(utteranceId: string): Promise<UtteranceTextDocType[]> {
    const db = await getDb();
    const docs = await db.collections.utterance_texts.findByIndex('utteranceId', utteranceId);
    return docs.map((doc) => doc.toJSON());
  }

  static async saveUtteranceText(data: UtteranceTextDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(data));
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
    const docs = await db.collections.media_items.findByIndex('textId', textId);
    return docs.map((doc) => doc.toJSON());
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
    const docs = await db.collections.tier_definitions.findByIndex('textId', textId);
    return docs.map((doc) => doc.toJSON());
  }

  /** Internal: persist tier definition + audit, no constraint validation. */
  private static async _persistTierDefinition(data: TierDefinitionDocType, source: AuditSource): Promise<string> {
    const db = await getDb();
    const existing = await db.collections.tier_definitions.findOne({ selector: { id: data.id } }).exec();
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

  /**
   * Save tier definition with structural constraint validation (R1, S5, S6).
   * Errors block the save; warnings are returned but the save proceeds.
   */
  static async saveTierDefinition(data: TierDefinitionDocType, source: AuditSource = 'human'): Promise<TierSaveResult> {
    const db = await getDb();

    // Load all tier definitions for the same text
    const allDocs = await db.collections.tier_definitions.findByIndex('textId', data.textId);
    const allTiers = allDocs.map((d) => d.toJSON());

    // Simulate adding/updating this tier
    const merged = allTiers.filter((t) => t.id !== data.id);
    merged.push(data);

    // Validate structural rules (no annotations needed for R1, S5, S6)
    const violations = validateTierConstraints(merged, []);
    const errors = violations.filter((v) => v.severity === 'error');
    if (errors.length > 0) {
      return { id: '', errors, warnings: [] };
    }

    const id = await this._persistTierDefinition(data, source);
    const warnings = violations.filter((v) => v.severity === 'warning');
    return { id, errors: [], warnings };
  }

  /**
   * Remove tier definition with cascade: deletes all annotations on this tier,
   * and rejects if child tiers still reference it.
   */
  static async removeTierDefinition(id: string, source: AuditSource = 'human'): Promise<{ errors: ConstraintViolation[] }> {
    const db = await getDb();

    // Check for child tiers that reference this tier as parent
    const allDocs = await db.collections.tier_definitions.findByIndex('parentTierId', id);
    const childTiers = allDocs.map((d) => d.toJSON());
    if (childTiers.length > 0) {
      return {
        errors: childTiers.map((ct) => ({
          rule: 'CASCADE',
          severity: 'error' as ConstraintSeverity,
          tierId: id,
          message: `Cannot delete: child tier "${ct.key}" (${ct.id}) still references this tier as parent.`,
        })),
      };
    }

    // Cascade: delete all annotations belonging to this tier (including owned anchors)
    const annDocs = await db.collections.tier_annotations.findByIndex('tierId', id);
    const tierAnns = annDocs.map((d) => d.toJSON());
    for (const ann of tierAnns) {
      if (ann.startAnchorId) await db.collections.anchors.remove(ann.startAnchorId);
      if (ann.endAnchorId) await db.collections.anchors.remove(ann.endAnchorId);
      await db.collections.tier_annotations.remove(ann.id);
      await writeAuditLog('tier_annotations', ann.id, 'delete', source);
    }

    await db.collections.tier_definitions.remove(id);
    await writeAuditLog('tier_definitions', id, 'delete', source);
    return { errors: [] };
  }

  // ── Tier annotation CRUD ───────────────────────────────────

  static async getTierAnnotations(tierId: string): Promise<TierAnnotationDocType[]> {
    const db = await getDb();
    const docs = await db.collections.tier_annotations.findByIndex('tierId', tierId);
    return docs.map((doc) => doc.toJSON());
  }

  /** Internal: load tier definitions + annotations for a given textId. */
  private static async _loadTierGraph(textId: string) {
    const db = await getDb();
    const tierDocs = await db.collections.tier_definitions.findByIndex('textId', textId);
    const tiers = tierDocs.map((d) => d.toJSON());
    const tierIds = tiers.map((t) => t.id);
    const annDocs = await db.collections.tier_annotations.findByIndexAnyOf('tierId', tierIds);
    const annotations = annDocs.map((d) => d.toJSON());
    return { tiers, annotations };
  }

  /** Internal: persist tier annotation + anchors + audit, no constraint validation. */
  private static async _persistTierAnnotation(data: TierAnnotationDocType, source: AuditSource, mediaId?: string): Promise<string> {
    const db = await getDb();
    data = normalizeTierAnnotationDocForStorage(data, {
      actorType: source === 'ai' ? 'ai' : source === 'system' ? 'system' : 'human',
      method: source === 'ai' ? 'auto-gloss' : source === 'system' ? 'migration' : 'manual',
    });

    // Enforce CAM write contract: stable IDs and confirmed-review lock for AI writes.
    assertStableId(data.id, 'tier annotation');
    assertReviewProtection(data.provenance?.reviewStatus, source);

    // Create anchors for time-bearing annotations (dual-write: keep startTime/endTime as cache)
    if (mediaId && data.startTime !== undefined && data.endTime !== undefined) {
      const now = new Date().toISOString();
      const startTime = data.startTime;
      const endTime = data.endTime;
      if (!data.startAnchorId) {
        const startAnchor: AnchorDocType = { id: newId('anc'), mediaId, time: startTime, createdAt: now };
        await db.collections.anchors.insert(startAnchor);
        data = { ...data, startAnchorId: startAnchor.id };
      }
      if (!data.endAnchorId) {
        const endAnchor: AnchorDocType = { id: newId('anc'), mediaId, time: endTime, createdAt: now };
        await db.collections.anchors.insert(endAnchor);
        data = { ...data, endAnchorId: endAnchor.id };
      }
    }

    const existing = await db.collections.tier_annotations.findOne({ selector: { id: data.id } }).exec();
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

  /**
   * Save tier annotation with full constraint validation.
   * Loads the tier graph context, simulates adding this annotation,
   * then runs all 14 constraint rules. Errors block the save.
   */
  static async saveTierAnnotation(data: TierAnnotationDocType, source: AuditSource = 'human'): Promise<TierSaveResult> {
    const db = await getDb();

    // Look up the tier to get textId for loading the full context
    const tierDoc = await db.collections.tier_definitions.findOne({ selector: { id: data.tierId } }).exec();
    if (!tierDoc) {
      return {
        id: '',
        errors: [{ rule: 'R2', severity: 'error', tierId: data.tierId, annotationId: data.id, message: `Annotation references non-existent tier "${data.tierId}".` }],
        warnings: [],
      };
    }
    const textId = tierDoc.toJSON().textId;

    // Resolve mediaId for anchor creation
    const mediaItems = await db.collections.media_items.findByIndex('textId', textId);
    const mediaId = mediaItems[0]?.toJSON().id;

    // Load full tier graph + annotations
    const { tiers, annotations: existingAnns } = await this._loadTierGraph(textId);

    // Merge: this annotation overrides any existing one with same id
    const merged = new Map(existingAnns.map((a) => [a.id, a]));
    merged.set(data.id, data);

    // Validate full constraint set
    const violations = validateTierConstraints(tiers, [...merged.values()]);
    const errors = violations.filter((v) => v.severity === 'error');
    if (errors.length > 0) {
      return { id: '', errors, warnings: [] };
    }

    const id = await this._persistTierAnnotation(data, source, mediaId);
    const warnings = violations.filter((v) => v.severity === 'warning');
    return { id, errors: [], warnings };
  }

  /**
   * Remove tier annotation with cascade: deletes all child annotations
   * that reference this annotation as parentAnnotationId.
   * Also removes owned anchors (independent anchor model).
   */
  static async removeTierAnnotation(id: string, source: AuditSource = 'human'): Promise<void> {
    const db = await getDb();

    // Cascade: delete child annotations referencing this one
    const childDocs = await db.collections.tier_annotations.findByIndex('parentAnnotationId', id);
    const children = childDocs.map((d) => d.toJSON());
    for (const child of children) {
      await this.removeTierAnnotation(child.id, source);
    }

    // Delete owned anchors
    const annDoc = await db.collections.tier_annotations.findOne({ selector: { id } }).exec();
    if (annDoc) {
      const ann = annDoc.toJSON();
      if (ann.startAnchorId) await db.collections.anchors.remove(ann.startAnchorId);
      if (ann.endAnchorId) await db.collections.anchors.remove(ann.endAnchorId);
    }

    await db.collections.tier_annotations.remove(id);
    await writeAuditLog('tier_annotations', id, 'delete', source);
  }

  // ── Batch save with constraint validation ──────────────────

  static async saveTierAnnotationsBatch(
    textId: string,
    newAnnotations: readonly TierAnnotationDocType[],
  ): Promise<{ violations: ConstraintViolation[]; warnings: ConstraintViolation[] }> {

    // Load current tier graph
    const { tiers, annotations: existingAnns } = await this._loadTierGraph(textId);

    // Resolve mediaId for anchor creation
    const db = await getDb();
    const mediaItems = await db.collections.media_items.findByIndex('textId', textId);
    const mediaId = mediaItems[0]?.toJSON().id;

    // Merge: new annotations override existing ones with same id
    const merged = new Map(existingAnns.map((a) => [a.id, a]));
    for (const ann of newAnnotations) {
      merged.set(ann.id, ann);
    }

    // Validate
    const allViolations = validateTierConstraints(tiers, [...merged.values()]);
    const errors = allViolations.filter((v) => v.severity === 'error');
    if (errors.length > 0) {
      return { violations: errors, warnings: [] };
    }

    // Persist + audit (using internal method to skip per-item re-validation)
    for (const ann of newAnnotations) {
      await this._persistTierAnnotation(ann, 'human', mediaId);
    }

    const warnings = allViolations.filter((v) => v.severity === 'warning');
    return { violations: [], warnings };
  }

  // ── Audit log queries ──────────────────────────────────────

  static async getAuditLogs(documentId: string): Promise<AuditLogDocType[]> {
    const db = await getDb();
    const docs = await db.collections.audit_logs.findByIndex('documentId', documentId);
    return docs
      .map((d) => d.toJSON())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  static async getAuditLogsByCollection(collection: string): Promise<AuditLogDocType[]> {
    const db = await getDb();
    const docs = await db.collections.audit_logs.findByIndex('collection', collection);
    return docs
      .map((d) => d.toJSON())
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
    const textId = newId('text');

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
    const mediaId = newId('media');

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

    await db.dexie.transaction(
      'rw',
      [
        db.dexie.utterance_texts,
        db.dexie.tier_annotations,
        db.dexie.tier_definitions,
        db.dexie.utterances,
        db.dexie.media_items,
        db.dexie.anchors,
        db.dexie.texts,
      ],
      async () => {
        // Collect utterance IDs so we can cascade to translations
        const allUtts = await db.dexie.utterances.where('textId').equals(textId).toArray();
        const uttIds = allUtts.map((u) => u.id);

        await this.removeNotesForUtteranceIds(db, uttIds);

        // Cascade: utterance_texts for these utterances
        for (const uttId of uttIds) {
          const tokens = await db.dexie.utterance_tokens.where('utteranceId').equals(uttId).toArray();
          const tokenIds = tokens.map((t) => t.id);
          const morphemeIds = (await db.dexie.utterance_morphemes.where('utteranceId').equals(uttId).toArray()).map((m) => m.id);
          await db.dexie.utterance_texts.where('utteranceId').equals(uttId).delete();
          if (tokenIds.length > 0 || morphemeIds.length > 0) {
            const targets: Array<[string, string]> = [
              ...tokenIds.map((id) => ['token', id] as [string, string]),
              ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
            ];
            await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
          }
          await db.dexie.utterance_tokens.where('utteranceId').equals(uttId).delete();
          await db.dexie.utterance_morphemes.where('utteranceId').equals(uttId).delete();
        }

        // Cascade: tier_annotations belonging to tier_definitions of this text
        const tierDefs = await db.dexie.tier_definitions.where('textId').equals(textId).toArray();
        for (const td of tierDefs) {
          await db.dexie.tier_annotations.where('tierId').equals(td.id).delete();
        }

        await db.dexie.tier_definitions.where('textId').equals(textId).delete();
        await db.dexie.utterances.where('textId').equals(textId).delete();

        // Cascade: anchors belonging to media of this text
        const mediaItems = await db.dexie.media_items.where('textId').equals(textId).toArray();
        for (const m of mediaItems) {
          await db.dexie.anchors.where('mediaId').equals(m.id).delete();
        }

        await db.dexie.media_items.where('textId').equals(textId).delete();
        await db.dexie.texts.delete(textId);
      },
    );
  }

  /** Delete a media item and its associated utterances + translations + anchors (cascade). */
  static async deleteAudio(mediaId: string): Promise<void> {
    const db = await getDb();

    await db.dexie.transaction(
      'rw',
      [
        db.dexie.utterance_texts,
        db.dexie.utterance_tokens,
        db.dexie.utterance_morphemes,
        db.dexie.token_lexeme_links,
        db.dexie.user_notes,
        db.dexie.utterances,
        db.dexie.anchors,
        db.dexie.media_items,
      ],
      async () => {
        // Find utterances linked to this media
        const utts = (await db.dexie.utterances.toArray()).filter((u) => u.mediaId === mediaId);
        const uttIds = utts.map((u) => u.id);

        await this.removeNotesForUtteranceIds(db, uttIds);

        // Cascade: utterance_texts + canonical token entities
        for (const u of utts) {
          const tokens = await db.dexie.utterance_tokens.where('utteranceId').equals(u.id).toArray();
          const tokenIds = tokens.map((t) => t.id);
          const morphemeIds = (await db.dexie.utterance_morphemes.where('utteranceId').equals(u.id).toArray()).map((m) => m.id);
          await db.dexie.utterance_texts.where('utteranceId').equals(u.id).delete();
          if (tokenIds.length > 0 || morphemeIds.length > 0) {
            const targets: Array<[string, string]> = [
              ...tokenIds.map((id) => ['token', id] as [string, string]),
              ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
            ];
            await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
          }
          await db.dexie.utterance_tokens.where('utteranceId').equals(u.id).delete();
          await db.dexie.utterance_morphemes.where('utteranceId').equals(u.id).delete();
        }

        if (uttIds.length > 0) {
          await db.dexie.utterances.bulkDelete(uttIds);
        }
        await db.dexie.anchors.where('mediaId').equals(mediaId).delete();
        await db.dexie.media_items.delete(mediaId);
      },
    );
  }

  /** Delete a single utterance and cascade-delete its translations + lexicon links + anchors. */
  static async removeUtterance(utteranceId: string): Promise<void> {
    const db = await getDb();
    await db.dexie.transaction(
      'rw',
      [
        db.dexie.utterance_texts,
        db.dexie.utterance_tokens,
        db.dexie.utterance_morphemes,
        db.dexie.token_lexeme_links,
        db.dexie.user_notes,
        db.dexie.utterances,
        db.dexie.anchors,
      ],
      async () => {
        await this.removeNotesForUtteranceIds(db, [utteranceId]);

        // Read utterance to get anchor IDs before deleting
        const utt = await db.dexie.utterances.get(utteranceId);
        const tokens = await db.dexie.utterance_tokens.where('utteranceId').equals(utteranceId).toArray();
        const tokenIds = tokens.map((t) => t.id);
        const morphemeIds = (await db.dexie.utterance_morphemes.where('utteranceId').equals(utteranceId).toArray()).map((m) => m.id);

        await db.dexie.utterance_texts.where('utteranceId').equals(utteranceId).delete();
        if (tokenIds.length > 0 || morphemeIds.length > 0) {
          const targets: Array<[string, string]> = [
            ...tokenIds.map((id) => ['token', id] as [string, string]),
            ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
          ];
          await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
        }
        await db.dexie.utterance_tokens.where('utteranceId').equals(utteranceId).delete();
        await db.dexie.utterance_morphemes.where('utteranceId').equals(utteranceId).delete();
        await db.dexie.utterances.delete(utteranceId);

        // Cleanup owned anchors
        if (utt?.startAnchorId) await db.dexie.anchors.delete(utt.startAnchorId);
        if (utt?.endAnchorId) await db.dexie.anchors.delete(utt.endAnchorId);
      },
    );
  }

  /**
   * Delete multiple utterances in one transaction with the same cascade semantics
    * as removeUtterance (utterance_texts, token_lexeme_links, anchors).
   */
  static async removeUtterancesBatch(utteranceIds: readonly string[]): Promise<void> {
    const ids = [...new Set(utteranceIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return;

    const db = await getDb();
    await db.dexie.transaction(
      'rw',
      [
        db.dexie.utterance_texts,
        db.dexie.utterance_tokens,
        db.dexie.utterance_morphemes,
        db.dexie.token_lexeme_links,
        db.dexie.user_notes,
        db.dexie.utterances,
        db.dexie.anchors,
      ],
      async () => {
        const utts = (await db.dexie.utterances.bulkGet(ids)).filter((u): u is NonNullable<typeof u> => Boolean(u));

        await this.removeNotesForUtteranceIds(db, ids);

        for (const utteranceId of ids) {
          const tokens = await db.dexie.utterance_tokens.where('utteranceId').equals(utteranceId).toArray();
          const tokenIds = tokens.map((t) => t.id);
          const morphemeIds = (await db.dexie.utterance_morphemes.where('utteranceId').equals(utteranceId).toArray()).map((m) => m.id);
          await db.dexie.utterance_texts.where('utteranceId').equals(utteranceId).delete();
          if (tokenIds.length > 0 || morphemeIds.length > 0) {
            const targets: Array<[string, string]> = [
              ...tokenIds.map((id) => ['token', id] as [string, string]),
              ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
            ];
            await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
          }
          await db.dexie.utterance_tokens.where('utteranceId').equals(utteranceId).delete();
          await db.dexie.utterance_morphemes.where('utteranceId').equals(utteranceId).delete();
        }

        await db.dexie.utterances.bulkDelete(ids);

        const anchorIds = new Set<string>();
        for (const utt of utts) {
          if (utt.startAnchorId) anchorIds.add(utt.startAnchorId);
          if (utt.endAnchorId) anchorIds.add(utt.endAnchorId);
        }

        if (anchorIds.size > 0) {
          await db.dexie.anchors.bulkDelete([...anchorIds]);
        }
      },
    );
  }

  /** Prune audit logs older than the given number of days. */
  static async pruneAuditLogs(maxAgeDays: number = 90): Promise<number> {
    const db = await getDb();
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
    const old = await db.dexie.audit_logs.where('timestamp').below(cutoff).primaryKeys();
    await db.dexie.audit_logs.bulkDelete(old);
    return old.length;
  }
}
