export type OccurrenceCitation = {
  textId: string;
  unitId: string;
  tokenId: string;
  lexemeId: string;
  senseId: string;
};

export function upsertOccurrenceCitation(
  current: readonly OccurrenceCitation[] | undefined,
  next: OccurrenceCitation,
): OccurrenceCitation[] {
  const rest = (current ?? []).filter((row) => row.tokenId !== next.tokenId);
  return [...rest, next];
}

export function occurrenceCitationStatus(
  citation: OccurrenceCitation,
  token: { lexemeId?: string; senseId?: string } | undefined,
): 'live' | 'broken' {
  if (!token) return 'broken';
  if (token.lexemeId !== citation.lexemeId || token.senseId !== citation.senseId) return 'broken';
  return 'live';
}
