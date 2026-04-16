import type { AiLocalToolReadModelMeta, AiPromptContext } from './chatDomain.types';

export function buildLocalToolReadModelMeta(context: AiPromptContext): AiLocalToolReadModelMeta {
  const rows = context.shortTerm?.localUnitIndex;
  const indexRowCount = Array.isArray(rows) ? rows.length : undefined;
  const epoch = context.shortTerm?.timelineReadModelEpoch;
  return {
    ...(typeof epoch === 'number' && Number.isFinite(epoch) ? { timelineReadModelEpoch: epoch } : {}),
    unitIndexComplete: context.shortTerm?.unitIndexComplete !== false,
    capturedAtMs: Date.now(),
    source: 'timeline_index',
    ...(indexRowCount !== undefined ? { indexRowCount } : {}),
  };
}
