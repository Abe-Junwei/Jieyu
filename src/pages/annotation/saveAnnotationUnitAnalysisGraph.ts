import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { AnnotationAnalysisGraphFixture } from '../../annotation/analysisGraph';
import {
  annotationAnalysisGraphFingerprint,
  validateAnnotationAnalysisGraphFixture,
} from '../../annotation/analysisGraph';
import type { LayerUnitDocType } from '../../types/jieyuDbDocTypes';
import type { AnnotationSelfCertaintyDeps } from './saveAnnotationUnitMeta';

const defaultDeps: AnnotationSelfCertaintyDeps = {
  listByTextId: (textId) => LinguisticService.units.listByTextId(textId),
  saveBatch: (items, options) => LinguisticService.units.saveBatch(items, options),
};

const graphWriteTail = new Map<string, Promise<unknown>>();

export async function saveAnnotationUnitAnalysisGraph(
  input: {
    textId: string;
    unitId: string;
    graph: AnnotationAnalysisGraphFixture;
    expectedBase?: AnnotationAnalysisGraphFixture | undefined;
  },
  deps: AnnotationSelfCertaintyDeps = defaultDeps,
): Promise<LayerUnitDocType> {
  const graph = validateAnnotationAnalysisGraphFixture(input.graph);
  return enqueueGraphWrite(input.unitId, () => writeAnalysisGraph(input, graph, deps));
}

async function writeAnalysisGraph(
  input: {
    textId: string;
    unitId: string;
    expectedBase?: AnnotationAnalysisGraphFixture | undefined;
  },
  graph: AnnotationAnalysisGraphFixture,
  deps: AnnotationSelfCertaintyDeps,
): Promise<LayerUnitDocType> {
  const units = await deps.listByTextId(input.textId);
  const existing = units.find((unit) => unit.id === input.unitId);
  if (!existing) throw new Error(`readback missing unit ${input.unitId}`);
  const expected = annotationAnalysisGraphFingerprint(input.expectedBase);
  if (annotationAnalysisGraphFingerprint(existing.analysisGraph) !== expected) {
    throw new Error(`analysisGraph baseline conflict for ${input.unitId}`);
  }
  const next: LayerUnitDocType = {
    ...existing,
    analysisGraph: graph,
    updatedAt: new Date().toISOString(),
  };
  await deps.saveBatch([next], {
    expectedAnalysisGraphFingerprint: { [input.unitId]: expected },
  });
  const readback = (await deps.listByTextId(input.textId)).find((unit) => unit.id === input.unitId);
  if (!readback?.analysisGraph) {
    throw new Error(`analysisGraph readback missing ${input.unitId}`);
  }
  if (canonicalGraph(readback.analysisGraph) !== canonicalGraph(graph)) {
    throw new Error(`analysisGraph readback mismatch for ${input.unitId}`);
  }
  return readback;
}

function enqueueGraphWrite<T>(unitId: string, action: () => Promise<T>): Promise<T> {
  const previous = graphWriteTail.get(unitId) ?? Promise.resolve();
  const run = previous.then(action, action);
  graphWriteTail.set(
    unitId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

// Object property order is not graph content; array order and every field are.
function canonicalGraph(graph: AnnotationAnalysisGraphFixture): string {
  return JSON.stringify(graph, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}
