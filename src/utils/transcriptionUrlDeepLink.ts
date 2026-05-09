/** Query keys consumed by TranscriptionPage deep-link handling (phase-2+). */
const TRANSCRIPTION_DEEP_LINK_PARAM_KEYS = [
  'textId',
  'mediaId',
  'layerId',
  'unitId',
  'unitKind',
] as const;

export type TranscriptionDeepLinkOptional = {
  mediaId?: string;
  layerId?: string;
  unitId?: string;
  unitKind: 'unit' | 'segment';
};

export function readTranscriptionDeepLinkOptionalParams(
  searchParams: URLSearchParams,
): TranscriptionDeepLinkOptional {
  const mediaId = searchParams.get('mediaId')?.trim() ?? '';
  const layerId = searchParams.get('layerId')?.trim() ?? '';
  const unitId = searchParams.get('unitId')?.trim() ?? '';
  const unitKindRaw = searchParams.get('unitKind')?.trim().toLowerCase() ?? '';
  const unitKind: 'unit' | 'segment' = unitKindRaw === 'segment' ? 'segment' : 'unit';
  return {
    ...(mediaId.length > 0 ? { mediaId } : {}),
    ...(layerId.length > 0 ? { layerId } : {}),
    ...(unitId.length > 0 ? { unitId } : {}),
    unitKind,
  };
}

export function hasTranscriptionDeepLinkSelectionPayload(
  o: TranscriptionDeepLinkOptional,
): boolean {
  return (
    (o.mediaId !== undefined && o.mediaId.length > 0) ||
    (o.layerId !== undefined && o.layerId.length > 0) ||
    (o.unitId !== undefined && o.unitId.length > 0)
  );
}

export function stripTranscriptionDeepLinkSearchParams(prev: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(prev);
  for (const k of TRANSCRIPTION_DEEP_LINK_PARAM_KEYS) {
    next.delete(k);
  }
  return next;
}

export type BuildTranscriptionDeepLinkHrefInput = {
  textId: string;
  mediaId?: string;
  layerId?: string;
  unitId?: string;
  unitKind?: 'unit' | 'segment';
};

/** Builds `/transcription?...` for home / external entry (textId required). */
export function buildTranscriptionDeepLinkHref(input: BuildTranscriptionDeepLinkHrefInput): string {
  const q = new URLSearchParams();
  q.set('textId', input.textId.trim());
  const trimmedMediaId = input.mediaId?.trim();
  const trimmedLayerId = input.layerId?.trim();
  const trimmedUnitId = input.unitId?.trim();
  if (trimmedMediaId !== undefined && trimmedMediaId.length > 0) q.set('mediaId', trimmedMediaId);
  if (trimmedLayerId !== undefined && trimmedLayerId.length > 0) q.set('layerId', trimmedLayerId);
  if (trimmedUnitId !== undefined && trimmedUnitId.length > 0) q.set('unitId', trimmedUnitId);
  if (input.unitKind === 'segment') q.set('unitKind', 'segment');
  const s = q.toString();
  return s.length > 0 ? `/transcription?${s}` : '/transcription';
}

const WORKSPACE_RETURN_STORAGE_KEY = 'jieyu.workspace.transcriptionReturn.v1';

export type TranscriptionWorkspaceReturnHint = {
  textId: string;
  mediaId?: string;
};

export function rememberTranscriptionWorkspaceReturnHint(
  hint: TranscriptionWorkspaceReturnHint,
): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmedMediaId = hint.mediaId?.trim();
    const payload: TranscriptionWorkspaceReturnHint = {
      textId: hint.textId.trim(),
      ...(trimmedMediaId !== undefined && trimmedMediaId.length > 0
        ? { mediaId: trimmedMediaId }
        : {}),
    };
    if (payload.textId.length === 0) return;
    window.sessionStorage.setItem(WORKSPACE_RETURN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function readTranscriptionWorkspaceReturnHint(): TranscriptionWorkspaceReturnHint | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(WORKSPACE_RETURN_STORAGE_KEY);
    const trimmedRaw = raw?.trim() ?? '';
    if (trimmedRaw.length === 0) return null;
    const parsed = JSON.parse(trimmedRaw) as unknown;
    if (parsed === null || parsed === undefined || typeof parsed !== 'object') return null;
    const textId = String((parsed as { textId?: unknown }).textId ?? '').trim();
    if (textId.length === 0) return null;
    const mediaId = String((parsed as { mediaId?: unknown }).mediaId ?? '').trim();
    return mediaId.length > 0 ? { textId, mediaId } : { textId };
  } catch {
    return null;
  }
}

/** 侧栏「返回转写」等：优先回到最近一次就绪的 text（及可选 media），否则 `/transcription`。 */
export function buildTranscriptionWorkspaceReturnHref(): string {
  const h = readTranscriptionWorkspaceReturnHint();
  if (h === null) return '/transcription';
  return buildTranscriptionDeepLinkHref({
    textId: h.textId,
    ...(h.mediaId !== undefined && h.mediaId.length > 0 ? { mediaId: h.mediaId } : {}),
  });
}
