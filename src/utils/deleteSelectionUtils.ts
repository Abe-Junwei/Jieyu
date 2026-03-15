import { normalizeSelection } from './selectionUtils';

export type DeletePlan =
  | { kind: 'none' }
  | { kind: 'single'; id: string }
  | { kind: 'multi'; ids: Set<string> };

/**
 * Resolve which utterances should be deleted from a potentially inconsistent
 * selection state (primary id + selected set).
 */
export function resolveDeletePlan(primaryId: string, ids: Iterable<string>): DeletePlan {
  const rawIds = Array.from(ids);
  if (rawIds.length === 0 && primaryId) {
    return { kind: 'single', id: primaryId };
  }

  const normalized = normalizeSelection(primaryId, rawIds);

  if (normalized.ids.size === 0) {
    return { kind: 'none' };
  }

  if (normalized.ids.size === 1) {
    return { kind: 'single', id: normalized.primaryId };
  }

  return { kind: 'multi', ids: normalized.ids };
}
