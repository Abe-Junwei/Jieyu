/**
 * Router-session corpus workset. Isolated from transcription `selectedUnitIds`.
 * Not written to URL, Dexie, or sessionStorage (三页联评 R8).
 */

export type CorpusBasketSession = {
  textId: string;
  mediaId: string;
  unitIds: string[];
};

let session: CorpusBasketSession = {
  textId: '',
  mediaId: '',
  unitIds: [],
};

export function resetCorpusBasketSessionForTests(): void {
  session = { textId: '', mediaId: '', unitIds: [] };
}

export function readCorpusBasketSession(): CorpusBasketSession {
  return { textId: session.textId, mediaId: session.mediaId, unitIds: [...session.unitIds] };
}

export function syncCorpusBasketScope(textId: string, mediaId: string): CorpusBasketSession {
  if (session.textId !== textId || session.mediaId !== mediaId) {
    session = { textId, mediaId, unitIds: [] };
  }
  return readCorpusBasketSession();
}

export function toggleCorpusBasketUnit(unitId: string): CorpusBasketSession {
  const id = unitId.trim();
  if (id.length === 0) return readCorpusBasketSession();
  const exists = session.unitIds.includes(id);
  session = {
    ...session,
    unitIds: exists ? session.unitIds.filter((item) => item !== id) : [...session.unitIds, id],
  };
  return readCorpusBasketSession();
}
