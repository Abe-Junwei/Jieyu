import type { JieyuDexie } from './engine';
import type { LayerUnitDocType } from './types';
import { mapUnitToLayerUnit } from '../utils/timelineUnitMapping';

/** Test helper: persist an unit-shaped doc as canonical `layer_units` + primary_text content. */
export async function putTestUnitAsLayerUnit(
  dexie: JieyuDexie,
  unit: LayerUnitDocType,
  defaultTranscriptionLayerId: string,
): Promise<void> {
  const { unit: mappedUnit, content } = mapUnitToLayerUnit(unit, defaultTranscriptionLayerId);
  await dexie.layer_units.put(mappedUnit);
  await dexie.layer_unit_contents.put(content);
}

/** Test helper: a default transcription layer (bridge tier) so unit writes have a home (JY-10). */
export async function putTestDefaultTranscriptionLayer(
  dexie: JieyuDexie,
  textId: string,
  layerId = `trc-default-${textId}`,
): Promise<string> {
  const now = '2026-01-01T00:00:00.000Z';
  await dexie.tier_definitions.put({
    id: layerId,
    textId,
    key: `bridge_${layerId}`,
    name: { default: 'Transcription' },
    tierType: 'time-aligned',
    contentType: 'transcription',
    languageId: 'und',
    modality: 'text',
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  });
  return layerId;
}
