/**
 * B16b: parse model claims, keep only rows from this turn's query results, render copyable text.
 * Example forms come from those rows, not from the claim text.
 * B17: external evidence packets are cited the same way (packet id → provenance line).
 */

import type { EvidencePacketV0 } from './evidencePacket';

export interface AnalysisEvidenceRow {
  id: string;
  unitId: string;
  form: string;
  gloss: string;
  /** B17 literature / web citation line when this row is an evidence packet. */
  citation?: string;
}

interface AnalysisClaim {
  claimId: string;
  text: string;
  rowIds: string[];
}

export interface VerifiedAnalysisReport {
  text: string;
  kept: number;
  dropped: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseAnalysisClaims(raw: string): AnalysisClaim[] | null {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    const body = asRecord(parsed);
    const claims = body?.claims;
    if (!Array.isArray(claims)) return null;
    const out: AnalysisClaim[] = [];
    for (const item of claims) {
      const row = asRecord(item);
      const claimId = typeof row?.claimId === 'string' ? row.claimId.trim() : '';
      const text = typeof row?.text === 'string' ? row.text.trim() : '';
      const rowIds = Array.isArray(row?.rowIds)
        ? row.rowIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : [];
      if (!claimId || !text || rowIds.length === 0) continue;
      out.push({ claimId, text, rowIds });
    }
    return out;
  } catch {
    return null;
  }
}

export function analysisRowsFromToolResults(
  results: ReadonlyArray<{ ok: boolean; result: unknown }>,
): AnalysisEvidenceRow[] {
  const rows: AnalysisEvidenceRow[] = [];
  for (const tool of results) {
    if (!tool.ok) continue;
    const body = asRecord(tool.result);
    if (!body) continue;
    if (Array.isArray(body.hits)) {
      for (const hit of body.hits) {
        const row = asRecord(hit);
        const target = asRecord(row?.target);
        const morphemeId = typeof row?.morphemeId === 'string' ? row.morphemeId : '';
        const unitId = typeof row?.unitId === 'string' ? row.unitId : '';
        if (!morphemeId || !unitId) continue;
        rows.push({
          id: morphemeId,
          unitId,
          form: typeof target?.form === 'string' ? target.form : '',
          gloss: typeof target?.gloss === 'string' ? target.gloss : '',
        });
      }
    }
    if (Array.isArray(body.counterexampleUnitIds)) {
      for (const id of body.counterexampleUnitIds) {
        if (typeof id !== 'string' || !id.trim()) continue;
        rows.push({ id, unitId: id, form: '', gloss: '' });
      }
    }
  }
  return rows;
}

function exampleLine(row: AnalysisEvidenceRow): string {
  if (row.citation) return `- ${row.citation}`;
  const form = row.form.trim();
  const gloss = row.gloss.trim();
  if (!form && !gloss) return `- ${row.unitId}`;
  return `- ${row.unitId}${form ? ` ${form}` : ''} ${gloss || '尚未标注'}`;
}

export function analysisRowsFromEvidencePackets(
  packets: readonly EvidencePacketV0[],
): AnalysisEvidenceRow[] {
  const rows: AnalysisEvidenceRow[] = [];
  for (const packet of packets) {
    const title = (packet.title ?? '').trim();
    const page = (packet.page ?? '').trim();
    const url = (packet.url ?? '').trim();
    const quote = (packet.quote ?? '').trim();
    if (!quote) continue;
    if (!((title && page) || (title && url))) continue;
    const where = page ? `p.${page}` : url;
    rows.push({
      id: packet.id,
      unitId: packet.id,
      form: '',
      gloss: '',
      citation: `${title} ${where} 「${quote}」`,
    });
  }
  return rows;
}

export function renderVerifiedAnalysisReport(
  raw: string,
  rows: readonly AnalysisEvidenceRow[],
): VerifiedAnalysisReport {
  const claims = parseAnalysisClaims(raw);
  if (!claims) return { text: '', kept: 0, dropped: 0 };
  const byId = new Map(rows.map((row) => [row.id, row]));
  const blocks: string[] = [];
  let dropped = 0;
  for (const claim of claims) {
    const cited = claim.rowIds.map((id) => byId.get(id));
    if (cited.some((row) => !row)) {
      dropped += 1;
      continue;
    }
    const lines = (cited as AnalysisEvidenceRow[]).map(exampleLine);
    blocks.push(`${claim.text}\n${lines.join('\n')}`);
  }
  return { text: blocks.join('\n\n'), kept: blocks.length, dropped };
}

export function runCorpusAnalysisReportReflection(content: string): {
  reflectionFlagged: boolean;
  checks: { name: string; passed: boolean }[];
  summary: string;
} {
  const claims = parseAnalysisClaims(content);
  const passed = claims !== null && claims.length > 0;
  return {
    reflectionFlagged: !passed,
    checks: [{ name: 'claims_json', passed }],
    summary: passed ? 'claims parsed' : 'claims json missing',
  };
}

export function buildCorpusAnalysisReportSystemPrompt(): string {
  return [
    'You are writing a corpus analysis as JSON only. Do not write prose outside the JSON.',
    'Each claim cites row ids from the tool results in this turn (morphemeId, counterexample unit id, or evidence packet id).',
    'Do not invent ids. Do not put word forms in the claim text; examples and citations are filled in locally.',
    'If a category is absent from the tool result, say 尚未标注 in the claim text.',
    'External evidence only corroborates; it does not fill missing corpus categories.',
    '{ "claims": [ { "claimId": "c1", "text": "argument without word forms", "rowIds": ["id-from-tool"] } ] }',
  ].join('\n');
}
