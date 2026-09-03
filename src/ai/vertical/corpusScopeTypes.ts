/**
 * Shared corpus scope / runtime source-set shape.
 * Kept separate from sourceResolver + corpusSourceSet to avoid import cycles.
 */

type CorpusScope = 'current_segment' | 'selection' | 'current_media' | 'project';

/** A9: imported PDF/notes are untrusted; workspace units default to workspace. */
export type SemanticGuardTrustTier = 'user' | 'workspace' | 'untrusted';

export interface CorpusSourceSet {
  scope: CorpusScope;
  sourceIds: readonly string[];
  mediaId?: string;
  projectId?: string;
  layerId?: string;
  /** Optional; omitted means workspace. Not persisted on Dexie rows. */
  trustTier?: SemanticGuardTrustTier;
}

export function resolveCorpusSourceSetTrustTier(
  sourceSet: Pick<CorpusSourceSet, 'trustTier'> | null | undefined,
): SemanticGuardTrustTier {
  return sourceSet?.trustTier ?? 'workspace';
}

export function trustTierForCitationType(
  type: 'unit' | 'note' | 'pdf' | 'schema',
): SemanticGuardTrustTier {
  return type === 'pdf' || type === 'note' ? 'untrusted' : 'workspace';
}
