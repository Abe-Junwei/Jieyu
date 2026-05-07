/**
 * Shared corpus scope / runtime source-set shape.
 * Kept separate from sourceResolver + corpusSourceSet to avoid import cycles.
 */

export type CorpusScope = 'current_segment' | 'selection' | 'current_media' | 'project';

export interface CorpusSourceSet {
  scope: CorpusScope;
  sourceIds: readonly string[];
  mediaId?: string;
  projectId?: string;
  layerId?: string;
}
