/**
 * Router-session corpus workset. Isolated from transcription `selectedUnitIds`.
 * Not written to URL, Dexie, or sessionStorage (三页联评 R8).
 * Scope is the current text (project); media is a view/deep-link hint, not basket identity.
 */

export type CorpusBasketSession = {
  textId: string;
  unitIds: string[];
};

let session: CorpusBasketSession = {
  textId: '',
  unitIds: [],
};

export function resetCorpusBasketSessionForTests(): void {
  session = { textId: '', unitIds: [] };
}

export function readCorpusBasketSession(): CorpusBasketSession {
  return { textId: session.textId, unitIds: [...session.unitIds] };
}

export function syncCorpusBasketScope(textId: string): CorpusBasketSession {
  if (session.textId !== textId) {
    session = { textId, unitIds: [] };
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
