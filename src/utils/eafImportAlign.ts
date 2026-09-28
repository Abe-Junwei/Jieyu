import type { LayerDocType } from '../db';

const EAF_META_MARKER = '__eafmeta_';

export function readExternalTierIdFromLayerKey(layerKey: string | undefined): string | undefined {
  if (layerKey === undefined || layerKey.length === 0) return undefined;
  const index = layerKey.indexOf(EAF_META_MARKER);
  if (index < 0) return undefined;
  const encoded = layerKey.slice(index + EAF_META_MARKER.length);
  if (encoded.length === 0) return undefined;
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded)) as { tierId?: unknown };
    return typeof parsed.tierId === 'string' && parsed.tierId.trim().length > 0
      ? parsed.tierId.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

export function mediaBasename(filename: string): string {
  const trimmed = filename.trim().replace(/^\.\//, '');
  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const base = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  return base.toLocaleLowerCase('en');
}

export function findMediaIdByFilename(
  rows: ReadonlyArray<{ id: string; filename: string }>,
  wantedFilename: string,
): string | undefined {
  const wanted = mediaBasename(wantedFilename);
  if (wanted.length === 0 || wanted === 'unknown.wav') return undefined;
  return rows.find((row) => mediaBasename(row.filename) === wanted)?.id;
}

export type EafLayerMatchInput = {
  tierId: string;
  layerType: LayerDocType['layerType'];
  languageId?: string;
  orthographyId?: string;
  displayNames: readonly string[];
};

export function matchLayerByEafTier(
  layers: readonly LayerDocType[],
  tier: EafLayerMatchInput,
): LayerDocType | undefined {
  const sameType = layers.filter((layer) => layer.layerType === tier.layerType);
  const byTierId = sameType.find(
    (layer) => readExternalTierIdFromLayerKey(layer.key) === tier.tierId,
  );
  if (byTierId) return byTierId;

  const languageId = tier.languageId?.trim();
  const orthographyId = tier.orthographyId?.trim();
  if (
    languageId !== undefined &&
    languageId.length > 0 &&
    orthographyId !== undefined &&
    orthographyId.length > 0 &&
    languageId !== 'und'
  ) {
    const byLanguage = sameType.find(
      (layer) => layer.languageId === languageId && layer.orthographyId === orthographyId,
    );
    if (byLanguage) return byLanguage;
  }

  const names = new Set(
    tier.displayNames
      .map((name) => name.trim().toLocaleLowerCase('en'))
      .filter((name) => name.length > 0),
  );
  if (names.size === 0) return undefined;
  return sameType.find((layer) => {
    const english =
      typeof layer.name === 'object' && layer.name !== null
        ? (layer.name.eng ?? layer.name.zho ?? '')
        : '';
    return names.has(english.trim().toLocaleLowerCase('en'));
  });
}

export type ReimportUnitRow = {
  id: string;
  textId: string;
  externalRef?: string;
  unitType?: string;
  parentUnitId?: string;
};

export type ReimportContentRow = {
  unitId?: string;
  layerId?: string;
  externalRef?: string;
};

export function findReimportUnitId(input: {
  textId: string;
  layerId: string;
  annotationId: string;
  units: readonly ReimportUnitRow[];
  contents: readonly ReimportContentRow[];
}): string | undefined {
  const annotationId = input.annotationId.trim();
  if (annotationId.length === 0) return undefined;
  for (const content of input.contents) {
    if (content.externalRef !== annotationId || content.layerId !== input.layerId) continue;
    if (content.unitId === undefined || content.unitId.length === 0) continue;
    const unit = input.units.find(
      (row) => row.id === content.unitId && row.textId === input.textId,
    );
    if (!unit) continue;
    if (
      unit.unitType === 'segment' &&
      unit.parentUnitId !== undefined &&
      unit.parentUnitId.length > 0
    ) {
      const parent = input.units.find(
        (row) => row.id === unit.parentUnitId && row.textId === input.textId,
      );
      if (parent) return parent.id;
    }
    return unit.id;
  }
  return undefined;
}

export function matchUnitByAnnotationRef<T extends { annotationId?: string }>(
  units: readonly T[],
  annotationRef: string | undefined,
): T | undefined {
  const ref = annotationRef?.trim();
  if (ref === undefined || ref.length === 0) return undefined;
  return units.find((unit) => unit.annotationId === ref);
}

export function glossLanguageKey(locale: string | undefined): string {
  const value = locale?.trim() ?? '';
  return value.length > 0 ? value : 'und';
}
