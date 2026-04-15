import type { JieyuDexie } from './engine';
import type { UtteranceDocType } from './types';
import { mapUtteranceToLayerUnit } from './migrations/timelineUnitMapping';

/** Test helper: persist an utterance-shaped doc as canonical `layer_units` + primary_text content. */
export async function putTestUtteranceAsLayerUnit(
  dexie: JieyuDexie,
  utterance: UtteranceDocType,
  defaultTranscriptionLayerId: string,
): Promise<void> {
  const { unit, content } = mapUtteranceToLayerUnit(utterance, defaultTranscriptionLayerId);
  await dexie.layer_units.put(unit);
  await dexie.layer_unit_contents.put(content);
}
