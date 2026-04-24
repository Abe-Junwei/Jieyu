/** Query keys consumed by TranscriptionPage deep-link handling (phase-2+). */
export const TRANSCRIPTION_DEEP_LINK_PARAM_KEYS = [
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
    ...(mediaId ? { mediaId } : {}),
    ...(layerId ? { layerId } : {}),
    ...(unitId ? { unitId } : {}),
    unitKind,
  };
}

export function hasTranscriptionDeepLinkSelectionPayload(o: TranscriptionDeepLinkOptional): boolean {
  return Boolean(o.mediaId || o.layerId || o.unitId);
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
  if (input.mediaId?.trim()) q.set('mediaId', input.mediaId.trim());
  if (input.layerId?.trim()) q.set('layerId', input.layerId.trim());
  if (input.unitId?.trim()) q.set('unitId', input.unitId.trim());
  if (input.unitKind === 'segment') q.set('unitKind', 'segment');
  const s = q.toString();
  return s.length > 0 ? `/transcription?${s}` : '/transcription';
}

const WORKSPACE_RETURN_STORAGE_KEY = 'jieyu.workspace.transcriptionReturn.v1';

export type TranscriptionWorkspaceReturnHint = {
  textId: string;
  mediaId?: string;
};

export function rememberTranscriptionWorkspaceReturnHint(hint: TranscriptionWorkspaceReturnHint): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: TranscriptionWorkspaceReturnHint = {
      textId: hint.textId.trim(),
      ...(hint.mediaId?.trim() ? { mediaId: hint.mediaId.trim() } : {}),
    };
    if (!payload.textId) return;
    window.sessionStorage.setItem(WORKSPACE_RETURN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function readTranscriptionWorkspaceReturnHint(): TranscriptionWorkspaceReturnHint | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(WORKSPACE_RETURN_STORAGE_KEY);
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const textId = String((parsed as { textId?: unknown }).textId ?? '').trim();
    if (!textId) return null;
    const mediaId = String((parsed as { mediaId?: unknown }).mediaId ?? '').trim();
    return mediaId ? { textId, mediaId } : { textId };
  } catch {
    return null;
  }
}

/** 侧栏「返回转写」等：优先回到最近一次就绪的 text（及可选 media），否则 `/transcription`。 */
export function buildTranscriptionWorkspaceReturnHref(): string {
  const h = readTranscriptionWorkspaceReturnHint();
  if (!h) return '/transcription';
  return buildTranscriptionDeepLinkHref({
    textId: h.textId,
    ...(h.mediaId ? { mediaId: h.mediaId } : {}),
  });
}
