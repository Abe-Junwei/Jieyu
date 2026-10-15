export type ChosenTimelineTextTarget =
  | { kind: 'segment'; segmentId: string; layerId: string }
  | { kind: 'unit-layer'; unitId: string; layerId: string }
  | { kind: 'unit-text'; unitId: string; layerId?: string };

export async function writeChosenTimelineText(
  target: ChosenTimelineTextTarget,
  value: string,
  writers: {
    saveSegmentContentForLayer?: (
      segmentId: string,
      layerId: string,
      value: string,
    ) => Promise<void>;
    saveUnitLayerText?: (unitId: string, value: string, layerId: string) => Promise<void>;
    saveUnitText?: (unitId: string, value: string, layerId?: string) => Promise<void>;
  },
): Promise<void> {
  if (target.kind === 'segment') {
    const save = writers.saveSegmentContentForLayer;
    if (!save) throw new Error('Segment text save unavailable');
    await save(target.segmentId, target.layerId, value);
    return;
  }
  if (target.kind === 'unit-layer') {
    const save = writers.saveUnitLayerText;
    if (!save) throw new Error('Unit layer text save unavailable');
    await save(target.unitId, value, target.layerId);
    return;
  }
  const save = writers.saveUnitText;
  if (!save) throw new Error('Unit text save unavailable');
  await save(target.unitId, value, target.layerId);
}
