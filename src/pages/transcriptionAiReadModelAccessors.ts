type SegmentContentByLayer = ReadonlyMap<string, ReadonlyMap<string, { text?: string }>>;

interface TokenWordLite {
  id?: string;
  pos?: unknown;
  gloss?: Record<string, unknown> | null | undefined;
}

interface UnitDocLite {
  id: string;
  words?: readonly TokenWordLite[] | undefined;
}

interface CreateTranscriptionAiReadModelAccessorsInput<TUnit extends UnitDocLite> {
  segmentContentByLayer?: SegmentContentByLayer | undefined;
  getUnitDocById: (id: string) => TUnit | undefined;
  segmentTargetScopeUnits: readonly TUnit[];
  getUnitTextForLayer: (unit: TUnit, layerId?: string) => string;
  allUnitRows: ReadonlyArray<{ id: string }>;
}

interface TranscriptionAiReadModelAccessors {
  readSegmentLayerText: (segmentId: string, layerId: string) => string;
  readUnitLayerText: (unitId: string, layerId?: string) => string;
  readTokenPos: (tokenId: string) => string | null;
  readTokenGloss: (tokenId: string, lang?: string) => string | null;
}

export function createTranscriptionAiReadModelAccessors<TUnit extends UnitDocLite>(
  input: CreateTranscriptionAiReadModelAccessorsInput<TUnit>,
): TranscriptionAiReadModelAccessors {
  const readSegmentLayerText = (segmentId: string, layerId: string): string => {
    const row = input.segmentContentByLayer?.get(layerId)?.get(segmentId);
    return typeof row?.text === 'string' ? row.text : '';
  };

  const readUnitLayerText = (unitId: string, layerId?: string): string => {
    const unit =
      input.getUnitDocById(unitId) ??
      input.segmentTargetScopeUnits.find((row) => row.id === unitId);
    if (!unit) return '';
    return input.getUnitTextForLayer(unit, layerId);
  };

  const readTokenPos = (tokenId: string): string | null => {
    for (const row of input.allUnitRows) {
      const doc = input.getUnitDocById(row.id);
      const words = doc?.words;
      if (words === undefined || words.length === 0) continue;
      const token = words.find((word) => word.id === tokenId);
      if (!token) continue;
      if (token.pos === undefined || token.pos === null) return null;
      const normalized = String(token.pos).trim();
      return normalized.length > 0 ? normalized : null;
    }
    return null;
  };

  const readTokenGloss = (tokenId: string, lang?: string): string | null => {
    const normalizedLang = lang?.trim();
    const language =
      normalizedLang !== undefined && normalizedLang.length > 0 ? normalizedLang : 'eng';
    for (const row of input.allUnitRows) {
      const doc = input.getUnitDocById(row.id);
      const words = doc?.words;
      if (words === undefined || words.length === 0) continue;
      const token = words.find((word) => word.id === tokenId);
      if (token?.gloss === undefined || token.gloss === null) return null;
      const gloss = token.gloss[language];
      if (gloss === undefined || gloss === null) return null;
      const normalized = String(gloss).trim();
      return normalized.length > 0 ? normalized : null;
    }
    return null;
  };

  return {
    readSegmentLayerText,
    readUnitLayerText,
    readTokenPos,
    readTokenGloss,
  };
}
