import type { LayerDocType } from '../db';
import { LinguisticService } from '../services/LinguisticService';

type LayerOrthographyRef = Pick<LayerDocType, 'id' | 'orthographyId'>;

function normalizeOrthographyId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function applyOrthographyTransformIfNeeded(input: {
  text: string;
  sourceOrthographyId?: string | null;
  targetOrthographyId?: string | null;
}): Promise<{ text: string; transformId?: string }> {
  const sourceOrthographyId = normalizeOrthographyId(input.sourceOrthographyId);
  const targetOrthographyId = normalizeOrthographyId(input.targetOrthographyId);
  if (!input.text || !sourceOrthographyId || !targetOrthographyId || sourceOrthographyId === targetOrthographyId) {
    return { text: input.text };
  }
  return LinguisticService.applyOrthographyTransform({
    text: input.text,
    sourceOrthographyId,
    targetOrthographyId,
  });
}

export async function transformTextForLayerTarget(input: {
  text: string;
  layers: ReadonlyArray<LayerOrthographyRef>;
  targetLayerId?: string | null;
  selectedLayerId?: string | null;
  fallbackSourceOrthographyId?: string | null;
}): Promise<string> {
  const targetLayerId = input.targetLayerId?.trim();
  if (!targetLayerId || !input.text) return input.text;

  const targetLayer = input.layers.find((layer) => layer.id === targetLayerId);
  const targetOrthographyId = normalizeOrthographyId(targetLayer?.orthographyId);
  if (!targetOrthographyId) return input.text;

  const selectedLayerId = input.selectedLayerId?.trim();
  const selectedLayer = selectedLayerId
    ? input.layers.find((layer) => layer.id === selectedLayerId)
    : undefined;
  const sourceOrthographyId = normalizeOrthographyId(selectedLayer?.orthographyId)
    ?? normalizeOrthographyId(input.fallbackSourceOrthographyId);

  return (await applyOrthographyTransformIfNeeded({
    text: input.text,
    ...(sourceOrthographyId !== undefined && { sourceOrthographyId }),
    targetOrthographyId,
  })).text;
}