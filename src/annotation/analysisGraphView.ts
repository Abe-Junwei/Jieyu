import type { AnnotationAnalysisGraphFixture, ProjectionDiagnostic } from './analysisGraph';
import {
  listAlternativeAnalysisChoices,
  type AlternativeAnalysisChoice,
} from './alternativeAnalysis';

export type AnalysisGraphMweView = {
  id: string;
  label: string;
  tokenIds: string[];
};

export type AnalysisGraphFeatureView = {
  ownerId: string;
  ownerLabel: string;
  glossLabel: string;
  features: Array<{ key: string; value: string }>;
};

export type AnalysisGraphNoticeView = {
  status: Exclude<ProjectionDiagnostic['status'], 'complete'>;
  target: ProjectionDiagnostic['target'];
  message: string;
};

export type AnalysisGraphLinkView = {
  id: string;
  kind:
    | 'reduplicates'
    | 'suppletes'
    | 'substitutesSegment'
    | 'deletesSegment'
    | 'overwritesTone'
    | 'discontinuousPartOf'
    | 'hasAllomorph'
    | 'rootPattern'
    | 'incorporation';
  source: string;
  target: string;
};

export type AnalysisGraphAlternativeView = AlternativeAnalysisChoice & {
  selectable: boolean;
};

export type AnalysisGraphReadout = {
  multiwordExpressions: AnalysisGraphMweView[];
  features: AnalysisGraphFeatureView[];
  links: AnalysisGraphLinkView[];
  notices: AnalysisGraphNoticeView[];
  alternatives: AnalysisGraphAlternativeView[];
};

function stringFeatures(
  features: Record<string, unknown> | undefined,
): Array<{ key: string; value: string }> {
  if (features === undefined) return [];
  return Object.entries(features)
    .flatMap(([key, value]) =>
      typeof value === 'string' && value.length > 0 ? [{ key, value }] : [],
    )
    .sort((left, right) => left.key.localeCompare(right.key));
}

/** Read-only badges for a saved utterance graph. Complete diagnostics stay hidden. */
export function readAnalysisGraphView(graph: AnnotationAnalysisGraphFixture): AnalysisGraphReadout {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const tokenOrder = new Map(
    graph.nodes.filter((node) => node.type === 'token').map((node, index) => [node.id, index]),
  );
  const groups = new Map<string, string[]>();
  const glossOwner = new Map<string, string>();
  for (const relation of graph.relations) {
    if (relation.type === 'partOfMwe') {
      const members = groups.get(relation.targetId) ?? [];
      members.push(relation.sourceId);
      groups.set(relation.targetId, members);
    }
    if (relation.type === 'glosses') glossOwner.set(relation.sourceId, relation.targetId);
  }

  const multiwordExpressions = [...groups.entries()].map(([id, tokenIds]) => {
    const ordered = [...tokenIds].sort(
      (left, right) => (tokenOrder.get(left) ?? 0) - (tokenOrder.get(right) ?? 0),
    );
    const label = nodes.get(id)?.label ?? '';
    return { id, label, tokenIds: ordered };
  });

  const features: AnalysisGraphFeatureView[] = [];
  for (const relation of graph.relations) {
    if (relation.type !== 'realizesFeature') continue;
    const gloss = nodes.get(relation.sourceId);
    const bundle = nodes.get(relation.targetId);
    if (gloss === undefined || bundle === undefined || bundle.type !== 'featureBundle') continue;
    const pairs = stringFeatures(bundle.features);
    if (pairs.length === 0) continue;
    const ownerId = glossOwner.get(gloss.id) ?? gloss.id;
    features.push({
      ownerId,
      ownerLabel: nodes.get(ownerId)?.label ?? ownerId,
      glossLabel: gloss.label,
      features: pairs,
    });
  }

  const links: AnalysisGraphLinkView[] = [];
  for (const relation of graph.relations) {
    if (
      relation.type !== 'reduplicates' &&
      relation.type !== 'suppletes' &&
      relation.type !== 'substitutesSegment' &&
      relation.type !== 'deletesSegment' &&
      relation.type !== 'overwritesTone' &&
      relation.type !== 'discontinuousPartOf' &&
      relation.type !== 'hasAllomorph'
    ) {
      continue;
    }
    const source = nodes.get(relation.sourceId);
    const target = nodes.get(relation.targetId);
    if (source === undefined || target === undefined) continue;
    links.push({
      id: relation.id,
      kind: relation.type,
      source: source.label,
      target: target.label,
    });
  }
  for (const node of graph.nodes) {
    if (node.type === 'root' && node.id.startsWith('root-')) {
      const pattern = nodes.get(`pat-${node.id.slice('root-'.length)}`);
      if (pattern === undefined) continue;
      links.push({
        id: node.id,
        kind: 'rootPattern',
        source: node.label,
        target: pattern.label,
      });
    }
    if (
      node.type === 'process' &&
      node.label === 'incorporation' &&
      node.id.startsWith('proc-inc-')
    ) {
      const morph = nodes.get(node.id.slice('proc-inc-'.length));
      if (morph === undefined) continue;
      links.push({
        id: node.id,
        kind: 'incorporation',
        source: morph.label,
        target: morph.label,
      });
    }
  }

  const seen = new Set<string>();
  const notices: AnalysisGraphNoticeView[] = [];
  for (const diagnostic of graph.projectionDiagnostics) {
    if (diagnostic.status === 'complete') continue;
    const key = `${diagnostic.status}\u0000${diagnostic.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notices.push({
      status: diagnostic.status,
      target: diagnostic.target,
      message: diagnostic.message,
    });
  }

  const grouped = new Map<string, AlternativeAnalysisChoice[]>();
  for (const choice of listAlternativeAnalysisChoices(graph)) {
    const members = grouped.get(choice.sourceId) ?? [];
    members.push(choice);
    grouped.set(choice.sourceId, members);
  }
  const alternatives: AnalysisGraphAlternativeView[] = [...grouped.values()].flatMap((members) => {
    const selectable = members.filter((choice) => choice.role !== 'rejected').length >= 2;
    return members.map((choice) => ({ ...choice, selectable }));
  });

  return { multiwordExpressions, features, links, notices, alternatives };
}
