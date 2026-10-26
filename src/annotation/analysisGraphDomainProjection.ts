import type { AnalysisGraphPayload, AnalysisGraphSurfacePart } from './analysisGraphDomain';

export interface ProjectedToken {
  id: string;
  unitId: string;
  tokenIndex: number;
  form: Record<string, string>;
  gloss: Record<string, string>;
  pos: string | null;
  provenance: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectedMorpheme {
  id: string;
  tokenId: string;
  morphemeIndex: number;
  form: Record<string, string>;
  gloss: Record<string, string>;
  pos: string | null;
  provenance: unknown | null;
  surfaceParts: AnalysisGraphSurfacePart[];
  createdAt: string;
  updatedAt: string;
}

export function projectAnalysisGraph(
  graph: AnalysisGraphPayload,
  unitId: string,
): { tokens: ProjectedToken[]; morphemes: ProjectedMorpheme[] } {
  const tokens: ProjectedToken[] = [];
  const morphemes: ProjectedMorpheme[] = [];
  const tokenIndexes = new Set<number>();
  for (const node of graph.nodes) {
    if (node.type !== 'token' || node.domain === undefined) continue;
    if (tokenIndexes.has(node.domain.index)) throw new Error('duplicate token index');
    tokenIndexes.add(node.domain.index);
    tokens.push({
      id: node.id,
      unitId,
      tokenIndex: node.domain.index,
      form: node.domain.form,
      gloss: node.domain.gloss ?? {},
      pos: node.domain.pos ?? null,
      provenance: node.domain.provenance ?? null,
      createdAt: node.domain.createdAt,
      updatedAt: node.domain.updatedAt,
    });
  }
  const tokenIds = new Set(tokens.map((token) => token.id));
  for (const node of graph.nodes) {
    if (node.type !== 'morpheme' || node.domain === undefined) continue;
    const parents = graph.relations.filter(
      (relation) =>
        relation.type === 'hasPart' &&
        relation.targetId === node.id &&
        tokenIds.has(relation.sourceId),
    );
    if (parents.length !== 1) throw new Error('morpheme parent is not unique');
    const tokenId = parents[0]?.sourceId;
    if (tokenId === undefined) throw new Error('morpheme parent is not unique');
    morphemes.push({
      id: node.id,
      tokenId,
      morphemeIndex: node.domain.index,
      form: node.domain.form,
      gloss: node.domain.gloss ?? {},
      pos: node.domain.pos ?? null,
      provenance: node.domain.provenance ?? null,
      surfaceParts: node.surfaceParts ?? [],
      createdAt: node.domain.createdAt,
      updatedAt: node.domain.updatedAt,
    });
  }
  return { tokens, morphemes };
}
