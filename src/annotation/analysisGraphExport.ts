import type { AnnotationAnalysisGraphFixture, ProjectionDiagnostic } from './analysisGraph';

export type CldfExampleRow = {
  ID: string;
  Primary_Text: string;
  Analyzed_Word: string;
  Gloss: string;
  Translated_Text: string;
  Analyzed_Orthography?: string;
};

function tokenNodes(graph: AnnotationAnalysisGraphFixture) {
  return graph.nodes.filter((node) => node.type === 'token');
}

const UD_UPOS = new Set([
  'ADJ',
  'ADP',
  'ADV',
  'AUX',
  'CCONJ',
  'DET',
  'INTJ',
  'NOUN',
  'NUM',
  'PART',
  'PRON',
  'PROPN',
  'PUNCT',
  'SCONJ',
  'SYM',
  'VERB',
  'X',
]);

function glossFeaturesFor(
  graph: AnnotationAnalysisGraphFixture,
  ownerId: string,
): Record<string, string> {
  const gloss = graph.relations.find(
    (relation) => relation.type === 'glosses' && relation.targetId === ownerId,
  );
  const glossNode = gloss ? graph.nodes.find((node) => node.id === gloss.sourceId) : undefined;
  const features = glossNode?.features;
  if (!features) return {};
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(features)) {
    if (typeof value === 'string' && value.length > 0) record[key] = value;
  }
  return record;
}

function featuresOfToken(graph: AnnotationAnalysisGraphFixture, tokenId: string): string {
  const morphIds = graph.relations
    .filter((relation) => relation.type === 'hasPart' && relation.sourceId === tokenId)
    .map((relation) => relation.targetId);
  const merged: Record<string, string> = {};
  for (const ownerId of [tokenId, ...morphIds]) {
    Object.assign(merged, glossFeaturesFor(graph, ownerId));
  }
  const feats = Object.entries(merged)
    .map(([key, value]) => `${key}=${value}`)
    .join('|');
  return feats.length > 0 ? feats : '_';
}

function posOfToken(
  graph: AnnotationAnalysisGraphFixture,
  tokenId: string,
): { upos: string; xpos: string; review?: string } {
  const pos = graph.relations.find(
    (relation) => relation.type === 'hasPos' && relation.targetId === tokenId,
  );
  const label = pos ? (graph.nodes.find((node) => node.id === pos.sourceId)?.label ?? '') : '';
  const upper = label.toUpperCase();
  if (UD_UPOS.has(upper)) return { upos: upper, xpos: '_' };
  if (label.length === 0) return { upos: '_', xpos: '_' };
  return {
    upos: '_',
    xpos: label,
    review: `Part of speech ${label} is not a UD tag; it is written in XPOS.`,
  };
}

function mweGroups(graph: AnnotationAnalysisGraphFixture): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const relation of graph.relations) {
    if (relation.type !== 'partOfMwe') continue;
    const members = groups.get(relation.targetId) ?? [];
    members.push(relation.sourceId);
    groups.set(relation.targetId, members);
  }
  return groups;
}

export function exportUtteranceToCldf(
  graph: AnnotationAnalysisGraphFixture,
  options: { translatedText?: string; extraOrthography?: string } = {},
): { row: CldfExampleRow | null; diagnostics: ProjectionDiagnostic[] } {
  const blocked = graph.projectionDiagnostics.some(
    (diagnostic) => diagnostic.target === 'cldf' && diagnostic.status === 'unsupported',
  );
  const tokens = tokenNodes(graph);
  const analyzed = tokens
    .map((token) => {
      const morphs = graph.relations
        .filter((relation) => relation.type === 'hasPart' && relation.sourceId === token.id)
        .map((relation) => graph.nodes.find((node) => node.id === relation.targetId)?.label ?? '')
        .filter((label) => label.length > 0);
      return morphs.length > 0 ? morphs.join('-') : token.label;
    })
    .join(' ');
  const row: CldfExampleRow | null = blocked
    ? null
    : {
        ID: graph.id,
        Primary_Text: graph.text,
        Analyzed_Word: analyzed.length > 0 ? analyzed : graph.text,
        Gloss: graph.displayGloss,
        Translated_Text: options.translatedText ?? '',
        ...(options.extraOrthography !== undefined && options.extraOrthography.length > 0
          ? { Analyzed_Orthography: options.extraOrthography }
          : {}),
      };
  return { row, diagnostics: graph.projectionDiagnostics };
}

export function exportUtteranceToConllu(graph: AnnotationAnalysisGraphFixture): string {
  const tokens = tokenNodes(graph);
  const groups = mweGroups(graph);
  const headByToken = new Map<string, string>();
  for (const members of groups.values()) {
    const ordered = tokens.map((token) => token.id).filter((id) => members.includes(id));
    const head = ordered[0];
    if (head === undefined) continue;
    for (const id of ordered.slice(1)) headByToken.set(id, head);
  }
  const indexById = new Map(tokens.map((token, index) => [token.id, index + 1]));
  const lines = [`# text = ${graph.text}`];
  const reviews = new Set<string>();
  for (const diagnostic of graph.projectionDiagnostics) {
    if (diagnostic.target !== 'conllu') continue;
    if (diagnostic.status === 'complete') continue;
    reviews.add(diagnostic.message);
  }
  for (const token of tokens) {
    const review = posOfToken(graph, token.id).review;
    if (review !== undefined) reviews.add(review);
  }
  for (const review of reviews) lines.push(`# diagnostic: ${review}`);
  tokens.forEach((token, index) => {
    const headId = headByToken.get(token.id);
    const head = headId !== undefined ? String(indexById.get(headId) ?? '_') : '_';
    const deprel = headId !== undefined ? 'fixed' : '_';
    const feats = featuresOfToken(graph, token.id);
    const pos = posOfToken(graph, token.id);
    lines.push(
      `${index + 1}\t${token.label}\t_\t${pos.upos}\t${pos.xpos}\t${feats}\t${head}\t${deprel}\t_\t_`,
    );
  });
  return lines.join('\n');
}

export function exportUtteranceToLigt(
  graph: AnnotationAnalysisGraphFixture,
): Record<string, unknown> {
  const tokens = tokenNodes(graph);
  const wordItems = tokens.map((token, index) => ({
    '@type': 'ligt:Item',
    '@id': token.id,
    'rdfs:label': token.label,
    ...(index + 1 < tokens.length ? { 'ligt:next': { '@id': tokens[index + 1]!.id } } : {}),
  }));
  const morphItems = tokens.flatMap((token) =>
    graph.relations
      .filter((relation) => relation.type === 'hasPart' && relation.sourceId === token.id)
      .map((relation) => graph.nodes.find((node) => node.id === relation.targetId))
      .filter((node): node is NonNullable<typeof node> => node?.type === 'morpheme'),
  );
  const morphPayload = morphItems.map((morph, index) => {
    const parent = graph.relations.find(
      (relation) => relation.type === 'hasPart' && relation.targetId === morph.id,
    );
    return {
      '@type': 'ligt:Item',
      '@id': morph.id,
      'rdfs:label': morph.label,
      ...(parent ? { 'dct:isPartOf': { '@id': parent.sourceId } } : {}),
      ...(index + 1 < morphItems.length
        ? { 'ligt:next': { '@id': morphItems[index + 1]!.id } }
        : {}),
    };
  });
  return {
    '@context': {
      ligt: 'https://ligt-dev.github.io/ligt#',
      dct: 'http://purl.org/dc/terms/',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    },
    '@type': 'ligt:Utterance',
    '@id': graph.id,
    'ligt:utterance': graph.text,
    'ligt:hasTier': [
      { '@type': 'ligt:WordTier', 'ligt:item': wordItems },
      { '@type': 'ligt:MorphTier', 'ligt:item': morphPayload },
    ],
  };
}

export function downloadTextFile(filename: string, contents: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
