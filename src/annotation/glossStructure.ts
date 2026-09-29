import type {
  AnalysisGraphNode,
  AnalysisGraphRelation,
  ProjectionDiagnostic,
} from './analysisGraph';
import { mapGlossLabelToFeatures } from './glossFeatureMap';
import { parseGlossStructure, type StructuralParsedSegment } from './structuralRuleProfile';

export type GlossStructureFragment = {
  nodes: AnalysisGraphNode[];
  relations: Array<Omit<AnalysisGraphRelation, 'id'>>;
  diagnostics: ProjectionDiagnostic[];
};

type GroupSplit = 'start' | 'morpheme' | 'clitic' | 'alternation';

type Group = {
  split: GroupSplit;
  parts: StructuralParsedSegment[];
};

const EMPTY: GlossStructureFragment = { nodes: [], relations: [], diagnostics: [] };

function featuresOf(label: string): Record<string, string> {
  return mapGlossLabelToFeatures(label).features;
}

function mergeFeatures(target: Record<string, string>, label: string): void {
  Object.assign(target, featuresOf(label));
}

/**
 * Leipzig boundaries in one token gloss become analysis nodes.
 * The author gloss string is not rewritten. Surface offsets are not guessed.
 */
export function glossStructureForToken(tokenId: string, gloss: string): GlossStructureFragment {
  const parsed = parseGlossStructure(gloss);
  const structural =
    parsed.boundaries.length > 0 ||
    parsed.segments.some((segment) => segment.kind !== 'lexical' && segment.kind !== 'feature');
  if (!structural) return EMPTY;

  const groups: Group[] = [];
  let current: Group = { split: 'start', parts: [] };
  let previousEnd = 0;
  for (const segment of parsed.segments) {
    const between = parsed.boundaries.filter(
      (boundary) => boundary.offset >= previousEnd && boundary.offset < segment.startOffset,
    );
    const splitter = between.find(
      (boundary) =>
        boundary.type === 'morpheme' ||
        boundary.type === 'clitic' ||
        boundary.type === 'alternation',
    );
    if (splitter !== undefined && current.parts.length > 0) {
      const split: GroupSplit =
        splitter.type === 'clitic'
          ? 'clitic'
          : splitter.type === 'alternation'
            ? 'alternation'
            : 'morpheme';
      groups.push(current);
      current = { split, parts: [] };
    } else if (current.parts.length > 0 && segment.wordIndex !== current.parts[0]!.wordIndex) {
      groups.push(current);
      current = { split: 'start', parts: [] };
    }
    current.parts.push(segment);
    previousEnd = segment.endOffset;
  }
  if (current.parts.length > 0) groups.push(current);

  const nodes: AnalysisGraphNode[] = [];
  const relations: Array<Omit<AnalysisGraphRelation, 'id'>> = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  let previousHeadId: string | undefined;
  let index = 0;

  const addNode = (
    type: AnalysisGraphNode['type'],
    label: string,
    features: Record<string, string>,
  ): string => {
    const id = `gs-${tokenId}-${index + 1}`;
    index += 1;
    nodes.push({
      id,
      type,
      label,
      ...(Object.keys(features).length > 0 ? { features } : {}),
    });
    relations.push({ type: 'hasPart', sourceId: tokenId, targetId: id });
    if (Object.keys(features).length > 0) {
      const featureId = `feat-${id}`;
      nodes.push({ id: featureId, type: 'featureBundle', label, features });
      relations.push({ type: 'realizesFeature', sourceId: id, targetId: featureId });
    }
    return id;
  };

  groups.forEach((group, groupIndex) => {
    const nextSplit = groups[groupIndex + 1]?.split;
    const cliticSide = group.split === 'clitic' || nextSplit === 'clitic';
    const content = group.parts.filter((part) => part.kind !== 'feature');
    const heads: string[] = [];
    if (content.length === 0) {
      const label = gloss.slice(group.parts[0]!.startOffset, group.parts.at(-1)!.endOffset);
      const features: Record<string, string> = {};
      for (const part of group.parts) mergeFeatures(features, part.text);
      heads.push(addNode(cliticSide ? 'word' : 'morpheme', label, features));
    } else {
      let pending: Record<string, string> = {};
      const flushFeatures = (features: Record<string, string>) => {
        Object.assign(features, pending);
        pending = {};
      };
      for (const part of group.parts) {
        if (part.kind === 'feature') {
          mergeFeatures(pending, part.text);
          continue;
        }
        const features: Record<string, string> = {};
        flushFeatures(features);
        if (part.kind === 'zero' || part.kind === 'supplied') {
          mergeFeatures(features, part.text);
          heads.push(addNode('zero', part.text, features));
          continue;
        }
        if (part.kind === 'infix') {
          mergeFeatures(features, part.text);
          const id = addNode('morpheme', part.text, features);
          heads.push(id);
          const hasPart = relations.find(
            (relation) => relation.type === 'hasPart' && relation.targetId === id,
          );
          if (hasPart !== undefined) hasPart.role = 'infix';
          continue;
        }
        heads.push(addNode(cliticSide ? 'word' : 'morpheme', part.text, features));
      }
      if (Object.keys(pending).length > 0 && heads.length > 0) {
        const head = nodes.find((node) => node.id === heads.at(-1));
        const bundle = nodes.find((node) => node.id === `feat-${heads.at(-1)}`);
        if (head !== undefined) {
          head.features = { ...head.features, ...pending };
        }
        if (bundle !== undefined) {
          bundle.features = { ...bundle.features, ...pending };
        } else if (head !== undefined) {
          const featureId = `feat-${head.id}`;
          nodes.push({
            id: featureId,
            type: 'featureBundle',
            label: head.label,
            features: pending,
          });
          relations.push({ type: 'realizesFeature', sourceId: head.id, targetId: featureId });
        }
      }
    }
    if (group.split === 'clitic' && previousHeadId !== undefined && heads[0] !== undefined) {
      relations.push({ type: 'cliticizesTo', sourceId: heads[0], targetId: previousHeadId });
    }
    if (group.parts.some((part) => part.kind === 'infix') && heads.length > 0) {
      const host = heads.find((id) => {
        const node = nodes.find((item) => item.id === id);
        const hasPart = relations.find(
          (relation) => relation.type === 'hasPart' && relation.targetId === id,
        );
        return node?.type === 'morpheme' && hasPart?.role !== 'infix';
      });
      if (host !== undefined) {
        relations.push({ type: 'discontinuousPartOf', sourceId: host, targetId: tokenId });
      }
    }
    previousHeadId = heads.at(-1);
  });

  const supplied = parsed.boundaries.filter((boundary) => boundary.type === 'supplied');
  for (let pair = 0; pair + 1 < supplied.length; pair += 2) {
    const open = supplied[pair]!;
    const close = supplied[pair + 1]!;
    const inside = parsed.segments.some(
      (segment) => segment.startOffset >= open.offset && segment.startOffset < close.offset,
    );
    if (!inside) addNode('zero', '∅', {});
  }

  if (parsed.warnings.some((warning) => warning.type === 'alternation_marker')) {
    diagnostics.push({
      target: 'conllu',
      status: 'needsReview',
      message: 'Alternation marker is not a morpheme boundary.',
    });
  }
  if (parsed.segments.some((segment) => segment.kind === 'infix')) {
    diagnostics.push({
      target: 'latex',
      status: 'degraded',
      message: 'Infix surface offsets are not in the gloss.',
    });
  }
  if (nodes.some((node) => node.type === 'zero')) {
    diagnostics.push({
      target: 'conllu',
      status: 'degraded',
      message: 'Zero morpheme is not a CoNLL-U empty node.',
    });
  }

  if (nodes.length === 0 && diagnostics.length === 0) return EMPTY;
  return { nodes, relations, diagnostics };
}
