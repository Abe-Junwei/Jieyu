import type { JieyuDexie } from './engine';
import type { LayerUnitDocType } from './types';
import { mapUnitToLayerUnit } from './migrations/timelineUnitMapping';

/** Test helper: persist an unit-shaped doc as canonical `layer_units` + primary_text content. */
export async function putTestUnitAsLayerUnit(
  dexie: JieyuDexie,
  unit: LayerUnitDocType,
  defaultTranscriptionLayerId: string,
): Promise<void> {
  const { unit, content } = mapUnitToLayerUnit(unit, defaultTranscriptionLayerId);
  await dexie.layer_units.put(unit);
  await dexie.layer_unit_contents.put(content);
}
