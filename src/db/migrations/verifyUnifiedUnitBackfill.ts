import type { UnifiedUnitBackfillPayload } from './buildUnifiedUnitBackfill';

const UNIT_RELATION_TYPES = new Set<string>(['aligned_to', 'derived_from', 'linked_reference']);

export function verifyUnifiedUnitBackfill(payload: UnifiedUnitBackfillPayload): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const unitIds = new Set<string>();
  const unitById = new Map<string, (typeof payload.units)[number]>();
  for (const unit of payload.units) {
    if (unitIds.has(unit.id)) {
      errors.push(`duplicate unit id ${unit.id}`);
    }
    unitIds.add(unit.id);
    unitById.set(unit.id, unit);
  }
  const relationIds = new Set<string>();
  const contentIds = new Set<string>();

  for (const content of payload.contents) {
    if (!unitIds.has(content.unitId)) {
      errors.push(`missing unit for content ${content.id}`);
    }
    if (contentIds.has(content.id)) {
      errors.push(`duplicate content ${content.id}`);
    }
    contentIds.add(content.id);

    const owner = unitById.get(content.unitId);
    if (owner) {
      if (content.textId !== owner.textId) {
        errors.push(`content ${content.id} textId ${content.textId} mismatches unit ${owner.id} textId ${owner.textId}`);
      }
      if (content.layerId !== owner.layerId) {
        errors.push(`content ${content.id} layerId ${content.layerId} mismatches unit ${owner.id} layerId ${owner.layerId}`);
      }
    }
  }

  for (const relation of payload.relations) {
    if (relationIds.has(relation.id)) {
      errors.push(`duplicate relation id ${relation.id}`);
    }
    relationIds.add(relation.id);
    if (!unitIds.has(relation.sourceUnitId)) errors.push(`missing source unit ${relation.sourceUnitId}`);
    if (!unitIds.has(relation.targetUnitId)) errors.push(`missing target unit ${relation.targetUnitId}`);
    if (relation.sourceUnitId === relation.targetUnitId) {
      errors.push(`relation ${relation.id} has identical source and target ${relation.sourceUnitId}`);
    }
    if (!UNIT_RELATION_TYPES.has(relation.relationType)) {
      errors.push(`relation ${relation.id} has invalid relationType ${String(relation.relationType)}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
