export type AnalysisWorkspaceTab = 'embedding' | 'stats';

export type AnalysisDeepLinkParams = {
  tab?: AnalysisWorkspaceTab;
  textId?: string;
  mediaId?: string;
  unitId?: string;
  intent?: 'similar';
};

export type AnalysisDeepLinkReadResult = {
  tab: AnalysisWorkspaceTab;
  textId: string;
  mediaId: string;
  unitId: string;
  autoFindSimilar: boolean;
};

export function buildAnalysisDeepLinkHref(params: AnalysisDeepLinkParams): string {
  const query = new URLSearchParams();
  if (params.tab !== undefined) query.set('tab', params.tab);
  const textId = params.textId?.trim() ?? '';
  if (textId.length > 0) query.set('textId', textId);
  const mediaId = params.mediaId?.trim() ?? '';
  if (mediaId.length > 0) query.set('mediaId', mediaId);
  const unitId = params.unitId?.trim() ?? '';
  if (unitId.length > 0) query.set('unitId', unitId);
  if (params.intent === 'similar') query.set('intent', 'similar');
  const serialized = query.toString();
  return serialized.length > 0 ? `/analysis?${serialized}` : '/analysis';
}

export function readAnalysisDeepLinkParams(
  searchParams: URLSearchParams,
): AnalysisDeepLinkReadResult {
  const rawTab = searchParams.get('tab')?.trim() ?? '';
  return {
    tab: rawTab === 'stats' ? 'stats' : 'embedding',
    textId: searchParams.get('textId')?.trim() ?? '',
    mediaId: searchParams.get('mediaId')?.trim() ?? '',
    unitId: searchParams.get('unitId')?.trim() ?? '',
    autoFindSimilar: searchParams.get('intent')?.trim() === 'similar',
  };
}

export function resolveAnalysisWorkspaceScope(input: {
  urlTextId: string;
  urlMediaId: string;
  hint: { textId: string; mediaId?: string } | null;
}): { textId: string; mediaId: string } {
  const hintTextId = input.hint?.textId ?? '';
  const hintMediaId = input.hint?.mediaId ?? '';
  const textId = input.urlTextId.length > 0 ? input.urlTextId : hintTextId;
  const mediaId =
    input.urlTextId.length > 0
      ? input.urlMediaId
      : input.urlMediaId.length > 0
        ? input.urlMediaId
        : hintMediaId;
  return { textId, mediaId };
}
