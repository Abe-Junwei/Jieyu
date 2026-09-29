import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { LayerUnitContentDocType } from '../../types/jieyuDbDocTypes';

export function joinAnnotationTokenForms(forms: readonly string[]): string {
  return forms
    .map((form) => form.trim())
    .filter((form) => form.length > 0)
    .join(' ');
}

function isTextModality(modality: LayerUnitContentDocType['modality']): boolean {
  return modality === undefined || modality.length === 0 || modality === 'text';
}

/** The transcription-layer row the annotation surface actually shows. */
export function pickTranscriptionContentForWriteback(
  contents: readonly LayerUnitContentDocType[],
  transcriptionLayerIds: readonly string[],
  unitId: string,
): LayerUnitContentDocType | null {
  const layers = new Set(transcriptionLayerIds.filter((id) => id.length > 0));
  if (layers.size === 0) return null;
  for (const row of contents) {
    const layerId = row.layerId ?? '';
    if (!layers.has(layerId) || !isTextModality(row.modality)) continue;
    if ((row.unitId ?? '').trim() !== unitId) continue;
    if ((row.text ?? '').trim().length === 0) continue;
    return row;
  }
  return null;
}

export function transcriptionMapWithSurface(
  current: Readonly<Record<string, string>> | undefined,
  languageId: string,
  text: string,
): Record<string, string> {
  const key = languageId.trim().length > 0 ? languageId.trim() : 'default';
  return { ...(current ?? {}), [key]: text };
}

export async function writeAnnotationFormsToTranscription(input: {
  textId: string;
  unitId: string;
  forms: readonly string[];
  languageId: string;
}): Promise<'written' | 'unchanged' | 'empty' | 'missing'> {
  const text = joinAnnotationTokenForms(input.forms);
  if (text.length === 0) return 'empty';
  const [layers, contents, units] = await Promise.all([
    LinguisticService.layers.listByTextId(input.textId),
    LinguisticService.timeline.listUnitTexts(input.unitId),
    LinguisticService.units.listByTextId(input.textId),
  ]);
  const transcriptionLayerIds = layers
    .filter((layer) => layer.layerType === 'transcription')
    .map((layer) => layer.id);
  const content = pickTranscriptionContentForWriteback(
    contents,
    transcriptionLayerIds,
    input.unitId,
  );
  const now = new Date().toISOString();
  if (content) {
    if ((content.text ?? '').trim() === text) return 'unchanged';
    await LinguisticService.timeline.saveUnitText({
      ...content,
      text,
      sourceType: 'human',
      updatedAt: now,
    });
    return 'written';
  }
  const unit = units.find((item) => item.id === input.unitId);
  if (!unit) return 'missing';
  const next = transcriptionMapWithSurface(unit.transcription, input.languageId, text);
  const key = input.languageId.trim().length > 0 ? input.languageId.trim() : 'default';
  if ((unit.transcription?.[key] ?? '').trim() === text) return 'unchanged';
  await LinguisticService.units.save({
    ...unit,
    transcription: next,
    updatedAt: now,
  });
  return 'written';
}
