import { glossStructureForToken } from './glossStructure';
import { mapGlossLabelToFeatures } from './glossFeatureMap';
import {
  validateAnnotationAnalysisGraphFixture,
  type AnalysisGraphNode,
  type AnalysisGraphRelation,
  type AnnotationAnalysisGraphFixture,
  type ProjectionDiagnostic,
} from './analysisGraph';

export type UtteranceMorphemeInput = {
  id: string;
  form: string;
  gloss?: string;
  pos?: string;
  senseId?: string;
  surfaceParts?: Array<{ startOffset: number; endOffset: number }>;
};

export type UtteranceTokenInput = {
  id: string;
  form: string;
  gloss?: string;
  pos?: string;
  senseId?: string;
  /** DMLex entry.partsOfSpeech. Used only when the token has no pos of its own. */
  entryPartsOfSpeech?: readonly string[];
  morphemes?: readonly UtteranceMorphemeInput[];
};

export type UtteranceProjectionInput = {
  id: string;
  text: string;
  displayGloss?: string;
  tokens: readonly UtteranceTokenInput[];
};

function filled(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

/**
 * Project one utterance into a standoff graph: word tier, morph tier,
 * `next` order, and `hasPart` alignment. Lexicon edges point at DMLex sense ids.
 */
export function projectUtteranceAnalysisGraph(
  input: UtteranceProjectionInput,
): AnnotationAnalysisGraphFixture {
  const nodes: AnalysisGraphNode[] = [];
  const relations: AnalysisGraphRelation[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  let relationIndex = 0;

  const addRelation = (relation: Omit<AnalysisGraphRelation, 'id'>) => {
    relations.push({ id: `rel-${relationIndex + 1}`, ...relation });
    relationIndex += 1;
  };

  const addGloss = (ownerId: string, label: string) => {
    const glossId = `gloss-${ownerId}`;
    const mapped = mapGlossLabelToFeatures(label);
    nodes.push({
      id: glossId,
      type: 'gloss',
      label,
      ...(Object.keys(mapped.features).length > 0 ? { features: mapped.features } : {}),
    });
    addRelation({ type: 'glosses', sourceId: glossId, targetId: ownerId });
    if (Object.keys(mapped.features).length > 0) {
      const featureId = `feat-${ownerId}`;
      nodes.push({
        id: featureId,
        type: 'featureBundle',
        label,
        features: mapped.features,
      });
      addRelation({ type: 'realizesFeature', sourceId: glossId, targetId: featureId });
    }
    for (const review of mapped.reviews) {
      diagnostics.push({
        target: 'conllu',
        status: 'needsReview',
        message: review,
      });
    }
  };

  const addPos = (ownerId: string, label: string) => {
    const posId = `pos-${ownerId}`;
    nodes.push({ id: posId, type: 'pos', label });
    addRelation({ type: 'hasPos', sourceId: posId, targetId: ownerId });
  };

  const addSense = (ownerId: string, senseId: string) => {
    const senseNodeId = `sense-${senseId}`;
    if (!nodes.some((node) => node.id === senseNodeId)) {
      nodes.push({ id: senseNodeId, type: 'lexemeRef', label: senseId });
    }
    addRelation({ type: 'linksLexeme', sourceId: ownerId, targetId: senseNodeId });
  };

  let previousTokenId: string | undefined;
  const glossLabels: string[] = [];

  for (const token of input.tokens) {
    nodes.push({ id: token.id, type: 'token', label: token.form });
    if (previousTokenId !== undefined) {
      addRelation({ type: 'next', sourceId: previousTokenId, targetId: token.id, role: 'word' });
    }
    previousTokenId = token.id;
    if (filled(token.gloss)) {
      const trimmed = token.gloss.trim();
      glossLabels.push(trimmed);
      const structure =
        (token.morphemes?.length ?? 0) === 0
          ? glossStructureForToken(token.id, trimmed)
          : undefined;
      if (structure !== undefined && structure.nodes.length > 0) {
        const glossId = `gloss-${token.id}`;
        nodes.push({ id: glossId, type: 'gloss', label: trimmed });
        addRelation({ type: 'glosses', sourceId: glossId, targetId: token.id });
        nodes.push(...structure.nodes);
        for (const relation of structure.relations) addRelation(relation);
        diagnostics.push(...structure.diagnostics);
      } else {
        addGloss(token.id, trimmed);
        if (structure !== undefined) diagnostics.push(...structure.diagnostics);
      }
    }
    if (filled(token.pos)) {
      addPos(token.id, token.pos.trim());
    } else if ((token.entryPartsOfSpeech?.length ?? 0) === 1) {
      addPos(token.id, token.entryPartsOfSpeech![0]!.trim());
    } else if ((token.entryPartsOfSpeech?.length ?? 0) > 1) {
      diagnostics.push({
        target: 'conllu',
        status: 'needsReview',
        message: `Entry has multiple parts of speech for ${token.form}; none was chosen.`,
      });
    }
    if (filled(token.senseId)) addSense(token.id, token.senseId.trim());

    let previousMorphId: string | undefined;
    let notedMorphOrder = false;
    for (const morph of token.morphemes ?? []) {
      const spans = morph.surfaceParts ?? [];
      const discontinuous = spans.length >= 2;
      nodes.push({
        id: morph.id,
        type: 'morpheme',
        label: morph.form,
        ...(spans.length > 0
          ? {
              surfaceParts: spans.map((span) => ({
                tokenId: token.id,
                startOffset: span.startOffset,
                endOffset: span.endOffset,
              })),
            }
          : {}),
      });
      addRelation({ type: 'hasPart', sourceId: token.id, targetId: morph.id });
      if (discontinuous) {
        addRelation({ type: 'discontinuousPartOf', sourceId: morph.id, targetId: token.id });
        diagnostics.push({
          target: 'latex',
          status: 'degraded',
          message: `Morpheme ${morph.form} covers discontinuous spans; Leipzig text cannot show them.`,
        });
        diagnostics.push({
          target: 'conllu',
          status: 'degraded',
          message: `Morpheme ${morph.form} is not a CoNLL-U empty node or a single syntactic word.`,
        });
      }
      if (previousMorphId !== undefined) {
        addRelation({ type: 'next', sourceId: previousMorphId, targetId: morph.id, role: 'morph' });
        if (!notedMorphOrder) {
          notedMorphOrder = true;
          diagnostics.push({
            target: 'conllu',
            status: 'degraded',
            message: 'Morpheme order is not a CoNLL-U dependency.',
          });
        }
      }
      previousMorphId = morph.id;
      if (filled(morph.gloss)) addGloss(morph.id, morph.gloss.trim());
      if (filled(morph.pos)) addPos(morph.id, morph.pos.trim());
      if (filled(morph.senseId)) addSense(morph.id, morph.senseId.trim());
    }
  }

  if (input.tokens.length === 0) {
    nodes.push({ id: `${input.id}-text`, type: 'token', label: input.text });
    diagnostics.push({
      target: 'cldf',
      status: 'unsupported',
      message: 'Utterance has no tokens, so the CLDF example row is omitted.',
    });
  }

  diagnostics.push({
    target: 'ligt',
    status: 'complete',
    message: 'Utterance projected with word order, morph alignment, and sense links.',
  });

  const joinedGloss = glossLabels.join(' ');
  const displayGloss = filled(input.displayGloss)
    ? input.displayGloss.trim()
    : joinedGloss.length > 0
      ? joinedGloss
      : input.text;

  return validateAnnotationAnalysisGraphFixture({
    id: input.id,
    text: input.text,
    displayGloss,
    nodes,
    relations,
    projectionDiagnostics: diagnostics,
  });
}
