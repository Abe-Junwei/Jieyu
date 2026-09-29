import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { AnnotationAnalysisGraphFixture } from '../../annotation/analysisGraph';
import { validateAnnotationAnalysisGraphFixture } from '../../annotation/analysisGraph';
import type { LayerUnitDocType } from '../../types/jieyuDbDocTypes';
import type { AnnotationSelfCertaintyDeps } from './saveAnnotationUnitMeta';

const defaultDeps: AnnotationSelfCertaintyDeps = {
  listByTextId: (textId) => LinguisticService.units.listByTextId(textId),
  saveBatch: (items) => LinguisticService.units.saveBatch(items),
};

export async function saveAnnotationUnitAnalysisGraph(
  input: {
    textId: string;
    unitId: string;
    graph: AnnotationAnalysisGraphFixture;
  },
  deps: AnnotationSelfCertaintyDeps = defaultDeps,
): Promise<LayerUnitDocType> {
  const graph = validateAnnotationAnalysisGraphFixture(input.graph);
  const units = await deps.listByTextId(input.textId);
  const existing = units.find((unit) => unit.id === input.unitId);
  if (!existing) throw new Error(`readback missing unit ${input.unitId}`);
  const next: LayerUnitDocType = {
    ...existing,
    analysisGraph: graph,
    updatedAt: new Date().toISOString(),
  };
  await deps.saveBatch([next]);
  const readback = (await deps.listByTextId(input.textId)).find((unit) => unit.id === input.unitId);
  if (!readback?.analysisGraph) {
    throw new Error(`analysisGraph readback missing ${input.unitId}`);
  }
  if (canonicalGraph(readback.analysisGraph) !== canonicalGraph(graph)) {
    throw new Error(`analysisGraph readback mismatch for ${input.unitId}`);
  }
  return readback;
}

// Object property order is not graph content; array order and every field are.
function canonicalGraph(graph: AnnotationAnalysisGraphFixture): string {
  return JSON.stringify(graph, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}
