import type { TierAnnotationDocType, TierDefinitionDocType, TierType } from '../db';

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
    units: number;
    unitTexts: number;
    transcriptionLayers: number;
    translationLayers: number;
    canonicalTokens: number;
    canonicalMorphemes: number;
    userNotes: number;
  };
  coverage: {
    transcribedUnits: number;
    translatedUnits: number;
    glossedUnits: number;
    verifiedUnits: number;
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
    if (!parent) continue;
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

  for (const tier of tiers) {
    const tierAnns = annotationsByTier.get(tier.id) ?? [];
    const isTimeRoot = tier.tierType === 'time-aligned';
    const isTimeSub = tier.tierType === 'time-subdivision';
    const isSymbolic = tier.tierType === 'symbolic-subdivision' || tier.tierType === 'symbolic-association';

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

    if (tier.parentTierId !== undefined) {
      const childIds = new Set(tierAnns.map((ann) => ann.id));
      for (const ann of annotations) {
        if (ann.parentAnnotationId && childIds.has(ann.parentAnnotationId) && ann.tierId !== tier.id) {
          violations.push({
            rule: 'S4',
            severity: 'warning',
            tierId: tier.id,
            annotationId: ann.id,
            message: `Annotation "${ann.id}" references child annotation on tier "${tier.key}" from tier "${ann.tierId}".`,
          });
        }
      }
    }

    if (tier.tierType === 'symbolic-subdivision' && tier.parentTierId !== undefined) {
      const siblingAssocTiers = tiers.filter(
        (t) => t.parentTierId === tier.id && t.tierType === 'symbolic-association',
      );
      if (siblingAssocTiers.length > 0) {
        const subCountByParent = new Map<string, number>();
        for (const ann of tierAnns) {
          if (ann.parentAnnotationId === undefined) continue;
          subCountByParent.set(ann.parentAnnotationId, (subCountByParent.get(ann.parentAnnotationId) ?? 0) + 1);
        }
        for (const assocTier of siblingAssocTiers) {
          const assocAnns = annotationsByTier.get(assocTier.id) ?? [];
          const assocCountByParent = new Map<string, number>();
          for (const ann of assocAnns) {
            if (ann.parentAnnotationId === undefined) continue;
            assocCountByParent.set(ann.parentAnnotationId, (assocCountByParent.get(ann.parentAnnotationId) ?? 0) + 1);
          }
          for (const [parentId, subCount] of subCountByParent) {
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