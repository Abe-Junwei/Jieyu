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
  /** Survives transcription deep-link strip; not a transcription selection key. */
  lexiconReturn?: string;
};

/** Builds `/transcription?...` for home / external entry (textId required). */
export function buildTranscriptionDeepLinkHref(input: BuildTranscriptionDeepLinkHrefInput): string {
  const q = new URLSearchParams();
  q.set('textId', input.textId.trim());
  const trimmedMediaId = input.mediaId?.trim();
  const trimmedLayerId = input.layerId?.trim();
  const trimmedUnitId = input.unitId?.trim();
  const trimmedLexiconReturn = input.lexiconReturn?.trim();
  if (trimmedMediaId !== undefined && trimmedMediaId.length > 0) q.set('mediaId', trimmedMediaId);
  if (trimmedLayerId !== undefined && trimmedLayerId.length > 0) q.set('layerId', trimmedLayerId);
  if (trimmedUnitId !== undefined && trimmedUnitId.length > 0) q.set('unitId', trimmedUnitId);
  if (input.unitKind === 'segment') q.set('unitKind', 'segment');
  if (trimmedLexiconReturn !== undefined && trimmedLexiconReturn.length > 0) {
    q.set('lexiconReturn', trimmedLexiconReturn);
  }
  const s = q.toString();
  return s.length > 0 ? `/transcription?${s}` : '/transcription';
}

const WORKSPACE_RETURN_STORAGE_KEY = 'jieyu.workspace.transcriptionReturn.v1';
const ACTIVE_PROJECT_TEXT_EVENT = 'jieyu:active-project-text';

let activeProjectTextId = '';
const activeProjectTextListeners = new Set<() => void>();

function readInitialActiveProjectTextId(): string {
  return readTranscriptionWorkspaceReturnHint()?.textId ?? '';
}

export function publishActiveProjectTextId(textId: string): void {
  const next = textId.trim();
  if (next.length === 0 || next === activeProjectTextId) return;
  activeProjectTextId = next;
  // 同一 text 已记住的 mediaId 是深链往返的一部分（见 R4 S5）：调用方往往只有
  // textId 在手，直接覆盖会把 mediaId 丢掉。仅同 textId 时合并，跨 text 不复用。
  // Keep a remembered mediaId for the same text: callers usually only hold the
  // textId, and overwriting here would drop the deep-link round-trip media.
  const existing = readTranscriptionWorkspaceReturnHint();
  const keepMediaId = existing !== null && existing.textId === next ? existing.mediaId : undefined;
  rememberTranscriptionWorkspaceReturnHint({
    textId: next,
    ...(keepMediaId !== undefined ? { mediaId: keepMediaId } : {}),
  });
  for (const listener of activeProjectTextListeners) listener();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ACTIVE_PROJECT_TEXT_EVENT, { detail: next }));
  }
}

export function clearActiveProjectTextId(): void {
  activeProjectTextId = '';
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(WORKSPACE_RETURN_STORAGE_KEY);
    } catch {
      /* quota / private mode */
    }
    window.dispatchEvent(new CustomEvent(ACTIVE_PROJECT_TEXT_EVENT, { detail: '' }));
  }
  for (const listener of activeProjectTextListeners) listener();
}

export function subscribeActiveProjectTextId(listener: () => void): () => void {
  activeProjectTextListeners.add(listener);
  return () => {
    activeProjectTextListeners.delete(listener);
  };
}

export function getActiveProjectTextId(): string {
  if (activeProjectTextId.length > 0) return activeProjectTextId;
  activeProjectTextId = readInitialActiveProjectTextId();
  return activeProjectTextId;
}

/**
 * 工作台「当前项目」：调用方手里的 textId 优先，否则用已发布的活动项目。供 `loadSnapshot(textId)` 的调用方使用（JY-02）。
 * The workspace's current project: the caller's textId when it has one, else the published active
 * project. Used by `loadSnapshot(textId)` callers (JY-02).
 */
export function resolveCurrentProjectTextId(preferred?: string | null): string {
  const explicit = typeof preferred === 'string' ? preferred.trim() : '';
  return explicit.length > 0 ? explicit : getActiveProjectTextId();
}

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
    for (const listener of activeProjectTextListeners) listener();
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
