/**
 * B16a read-only corpus queries. Pure: callers load rows, these functions only count.
 */

export interface AnalysisMorpheme {
  id: string;
  unitId: string;
  tokenId: string;
  tokenIndex: number;
  morphemeIndex: number;
  tokenPos: string;
  form: string;
  gloss: string;
}

export interface KwicHit {
  unitId: string;
  morphemeId: string;
  left: { form: string; gloss: string } | null;
  target: { form: string; gloss: string };
  right: { form: string; gloss: string } | null;
}

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 50;
const MAX_COUNTEREXAMPLES = 20;

function clampLimit(raw: number | undefined, fallback: number): number {
  if (raw === undefined || !Number.isFinite(raw)) return fallback;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(raw)));
}

function sameLabel(left: string, right: string): boolean {
  return left.trim() === right.trim() && right.trim().length > 0;
}

function byOrder(a: AnalysisMorpheme, b: AnalysisMorpheme): number {
  if (a.unitId !== b.unitId) return a.unitId < b.unitId ? -1 : 1;
  if (a.tokenIndex !== b.tokenIndex) return a.tokenIndex - b.tokenIndex;
  return a.morphemeIndex - b.morphemeIndex;
}

function side(row: AnalysisMorpheme | undefined): { form: string; gloss: string } | null {
  if (!row) return null;
  return { form: row.form, gloss: row.gloss };
}

export function concordanceKwic(
  rows: readonly AnalysisMorpheme[],
  query: { gloss?: string; form?: string; limit?: number },
): { ok: true; count: number; hits: KwicHit[] } | { ok: false; error: string } {
  const gloss = query.gloss?.trim() ?? '';
  const form = query.form?.trim() ?? '';
  if (!gloss && !form) return { ok: false, error: 'gloss or form is required' };
  const limit = clampLimit(query.limit, DEFAULT_LIMIT);
  const ordered = [...rows].sort(byOrder);
  const byUnit = new Map<string, AnalysisMorpheme[]>();
  for (const row of ordered) {
    const list = byUnit.get(row.unitId) ?? [];
    list.push(row);
    byUnit.set(row.unitId, list);
  }
  const hits: KwicHit[] = [];
  for (const list of byUnit.values()) {
    for (let i = 0; i < list.length; i += 1) {
      const row = list[i]!;
      const glossHit = gloss ? sameLabel(row.gloss, gloss) : true;
      const formHit = form ? sameLabel(row.form, form) : true;
      if (!glossHit || !formHit) continue;
      hits.push({
        unitId: row.unitId,
        morphemeId: row.id,
        left: side(list[i - 1]),
        target: { form: row.form, gloss: row.gloss },
        right: side(list[i + 1]),
      });
      if (hits.length >= limit) return { ok: true, count: hits.length, hits };
    }
  }
  return { ok: true, count: hits.length, hits };
}

export function queryMorphemeParadigm(
  rows: readonly AnalysisMorpheme[],
  query: { pos?: string },
):
  | {
      ok: true;
      pos: string;
      tokenCount: number;
      adjacent: Array<{ leftGloss: string; rightGloss: string; count: number }>;
    }
  | { ok: false; error: string } {
  const pos = query.pos?.trim() ?? '';
  if (!pos) return { ok: false, error: 'pos is required' };
  const tokens = new Map<string, AnalysisMorpheme[]>();
  for (const row of rows) {
    if (row.tokenPos.trim().toLowerCase() !== pos.toLowerCase()) continue;
    const list = tokens.get(row.tokenId) ?? [];
    list.push(row);
    tokens.set(row.tokenId, list);
  }
  const counts = new Map<string, { leftGloss: string; rightGloss: string; count: number }>();
  for (const list of tokens.values()) {
    const ordered = [...list].sort((a, b) => a.morphemeIndex - b.morphemeIndex);
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const leftGloss = ordered[i]!.gloss.trim();
      const rightGloss = ordered[i + 1]!.gloss.trim();
      if (!leftGloss || !rightGloss) continue;
      const key = `${leftGloss}\t${rightGloss}`;
      const prev = counts.get(key);
      counts.set(key, {
        leftGloss,
        rightGloss,
        count: (prev?.count ?? 0) + 1,
      });
    }
  }
  const adjacent = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.leftGloss.localeCompare(b.leftGloss),
  );
  return { ok: true, pos, tokenCount: tokens.size, adjacent };
}

export function findCounterexamples(
  rows: readonly AnalysisMorpheme[],
  query: { gloss?: string; pos?: string; expect?: 'present' | 'absent'; limit?: number },
):
  | {
      ok: true;
      gloss: string;
      expect: 'present' | 'absent';
      matchCount: number;
      counterexampleCount: number;
      counterexampleUnitIds: string[];
    }
  | { ok: false; error: string } {
  const gloss = query.gloss?.trim() ?? '';
  if (!gloss) return { ok: false, error: 'gloss is required' };
  const expect = query.expect === 'absent' ? 'absent' : 'present';
  const pos = query.pos?.trim().toLowerCase() ?? '';
  const limit = clampLimit(query.limit, MAX_COUNTEREXAMPLES);
  const units = new Map<string, { inScope: boolean; hasGloss: boolean }>();
  for (const row of rows) {
    const entry = units.get(row.unitId) ?? { inScope: false, hasGloss: false };
    const posHit = !pos || row.tokenPos.trim().toLowerCase() === pos;
    if (posHit) entry.inScope = true;
    if (sameLabel(row.gloss, gloss)) entry.hasGloss = true;
    units.set(row.unitId, entry);
  }
  const counterexampleUnitIds: string[] = [];
  let matchCount = 0;
  let counterexampleCount = 0;
  for (const [unitId, entry] of [...units.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!entry.inScope) continue;
    const matches = expect === 'present' ? entry.hasGloss : !entry.hasGloss;
    if (matches) {
      matchCount += 1;
      continue;
    }
    counterexampleCount += 1;
    if (counterexampleUnitIds.length < limit) counterexampleUnitIds.push(unitId);
  }
  return { ok: true, gloss, expect, matchCount, counterexampleCount, counterexampleUnitIds };
}
