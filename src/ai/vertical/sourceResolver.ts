import type { AiPromptContext } from '../chat/chatDomain.types';
import type { AiMessageCitation } from '../../db';
import { buildEvidencePacketV0, type EvidencePacketV0, type EvidencePacketSourceSetSnapshot } from './evidencePacket';
import type { SavedCorpusSourceSet } from './corpusSourceSet';

export type CorpusScope = 'current_segment' | 'selection' | 'current_media' | 'project';

export interface CorpusSourceSet {
  scope: CorpusScope;
  sourceIds: readonly string[];
  mediaId?: string;
  projectId?: string;
  layerId?: string;
}

/**
 * Resolve the available corpus source set from the current prompt context.
 * Priority: current_segment > selection > current_media > project.
 * Returns null when no scoping info is available (caller should fall back to project-wide).
 */
/**
 * PR-7b: When `segment_qa` is active and the corpus set lists concrete unit/source ids,
 * pass them as RAG `candidateSourceIds` to narrow hybrid search.
 */
export function ragCandidateSourceIdsForSegmentQa(
  workflowId: string | null | undefined,
  corpus: CorpusSourceSet | null,
): readonly string[] | undefined {
  if (workflowId !== 'segment_qa' || !corpus) return undefined;
  const ids = corpus.sourceIds.filter((id) => typeof id === 'string' && id.trim().length > 0);
  return ids.length > 0 ? ids : undefined;
}

export function resolveCorpusSourceSet(aiContext: AiPromptContext | null): CorpusSourceSet | null {
  if (!aiContext?.shortTerm) return null;
  const st = aiContext.shortTerm;

  if (st.activeSegmentUnitId) {
    const result: CorpusSourceSet = {
      scope: 'current_segment',
      sourceIds: [st.activeSegmentUnitId],
    };
    if (st.currentMediaId) result.mediaId = st.currentMediaId;
    if (st.selectedLayerId) result.layerId = st.selectedLayerId;
    return result;
  }

  if (st.selectedUnitIds && st.selectedUnitIds.length > 0) {
    const result: CorpusSourceSet = {
      scope: 'selection',
      sourceIds: st.selectedUnitIds,
    };
    if (st.currentMediaId) result.mediaId = st.currentMediaId;
    if (st.selectedLayerId) result.layerId = st.selectedLayerId;
    return result;
  }

  if (st.currentMediaId) {
    const result: CorpusSourceSet = {
      scope: 'current_media',
      sourceIds: [],
      mediaId: st.currentMediaId,
    };
    if (st.selectedLayerId) result.layerId = st.selectedLayerId;
    return result;
  }

  return {
    scope: 'project',
    sourceIds: [],
  };
}

function citationTypeToEvidenceSourceType(citationType: AiMessageCitation['type']): EvidencePacketV0['sourceType'] {
  switch (citationType) {
    case 'unit':
      return 'segment';
    case 'note':
      return 'note';
    case 'pdf':
      return 'document';
    case 'schema':
      return 'layer_text';
    default:
      return 'segment';
  }
}

export function buildSourceSetSnapshot(sourceSet: CorpusSourceSet | null): EvidencePacketSourceSetSnapshot | undefined {
  if (!sourceSet) return undefined;
  const snapshot: EvidencePacketSourceSetSnapshot = {
    sourceSetId: sourceSet.sourceIds.join('_') || 'project_wide',
    scope: sourceSet.scope,
    memberCount: sourceSet.sourceIds.length,
  };
  if (sourceSet.mediaId !== undefined) snapshot.mediaId = sourceSet.mediaId;
  if (sourceSet.layerId !== undefined) snapshot.layerId = sourceSet.layerId;
  if (sourceSet.projectId !== undefined) snapshot.projectId = sourceSet.projectId;
  return snapshot;
}

/**
 * Map RAG citations to EvidencePacketV0.
 * Each citation becomes one evidence packet; snippet maps to quote.
 * Confidence is set to a default RAG-recall value (0.8) when not available.
 */
export function ragCitationsToEvidencePackets(
  citations: readonly AiMessageCitation[],
  sourceSet: CorpusSourceSet | null,
): EvidencePacketV0[] {
  const snapshot = buildSourceSetSnapshot(sourceSet);
  return citations.map((citation, index) => {
    const packetInput: Parameters<typeof buildEvidencePacketV0>[0] = {
      id: `${citation.refId}_${index}`,
      sourceType: citationTypeToEvidenceSourceType(citation.type),
      sourceId: citation.refId,
      quote: citation.snippet ?? '',
      confidence: 0.8,
      reasonCode: 'rag_citation',
    };
    if (sourceSet?.mediaId) packetInput.mediaId = sourceSet.mediaId;
    if (sourceSet?.layerId) packetInput.layerId = sourceSet.layerId;
    if (sourceSet?.projectId) packetInput.projectId = sourceSet.projectId;
    if (snapshot) {
      packetInput.sourceSetId = snapshot.sourceSetId;
      packetInput.sourceSetSnapshot = snapshot;
    }
    return buildEvidencePacketV0(packetInput);
  });
}

/**
 * Build a runtime CorpusSourceSet from a SavedCorpusSourceSet.
 * Used when the user has explicitly selected a saved source set.
 */
export function resolveCorpusSourceSetFromSaved(
  saved: SavedCorpusSourceSet | null | undefined,
): CorpusSourceSet | null {
  if (!saved) return null;
  const result: CorpusSourceSet = {
    scope: saved.scope,
    sourceIds: saved.members.map((m) => m.id),
  };
  if (saved.mediaId !== undefined) result.mediaId = saved.mediaId;
  if (saved.layerId !== undefined) result.layerId = saved.layerId;
  if (saved.projectId !== undefined) result.projectId = saved.projectId;
  return result;
}
