import type { UnitMorphemeDocType, UnitTokenDocType } from '../../../db/types';
import { storagePort } from '../../../db/storagePort';
import {
  concordanceKwic,
  findCounterexamples,
  queryMorphemeParadigm,
  type AnalysisMorpheme,
} from '../../analysis/corpusAnalysisQueries';
import { featureFlags } from '../../config/featureFlags';
import type { AiPromptContext } from '../chatDomain.types';
import type { LocalContextToolResult } from '../localContextToolTypes';
import { buildReadModelMetaWithSource } from './readModelMeta';

function firstValue(record: Record<string, string> | undefined): string {
  if (!record) return '';
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function toRows(tokens: UnitTokenDocType[], morphemes: UnitMorphemeDocType[]): AnalysisMorpheme[] {
  const tokenById = new Map(tokens.map((token) => [token.id, token]));
  return morphemes.flatMap((morpheme) => {
    const token = tokenById.get(morpheme.tokenId);
    if (!token) return [];
    return [
      {
        id: morpheme.id,
        unitId: morpheme.unitId,
        tokenId: morpheme.tokenId,
        tokenIndex: token.tokenIndex,
        morphemeIndex: morpheme.morphemeIndex,
        tokenPos: token.pos ?? morpheme.pos ?? '',
        form: firstValue(morpheme.form),
        gloss: firstValue(morpheme.gloss),
      },
    ];
  });
}

async function loadRows(textId: string): Promise<AnalysisMorpheme[]> {
  const [tokens, morphemes] = await Promise.all([
    storagePort().listUnitTokensByText(textId),
    storagePort().listUnitMorphemesByText(textId),
  ]);
  return toRows(tokens, morphemes);
}

function textArg(args: Record<string, unknown>, key: string): string | undefined {
  const raw = args[key];
  return typeof raw === 'string' ? raw : undefined;
}

function limitArg(args: Record<string, unknown>): number | undefined {
  const raw = args.limit;
  return typeof raw === 'number' ? raw : undefined;
}

export async function runCorpusAnalysisTool(
  name: 'concordance_kwic' | 'query_morpheme_paradigm' | 'find_counterexamples',
  args: Record<string, unknown>,
  context: AiPromptContext,
): Promise<LocalContextToolResult> {
  if (!featureFlags.corpusAnalysisQueryToolsEnabled) {
    return { ok: false, name, result: null, error: 'flag_off' };
  }
  const textId = context.shortTerm?.workspaceTextId?.trim() ?? '';
  if (!textId) {
    return { ok: false, name, result: null, error: 'workspaceTextId is required' };
  }
  const rows = await loadRows(textId);
  const readModel = buildReadModelMetaWithSource(context, 'timeline_index');
  if (name === 'concordance_kwic') {
    const gloss = textArg(args, 'gloss');
    const form = textArg(args, 'form');
    const limit = limitArg(args);
    const result = concordanceKwic(rows, {
      ...(gloss !== undefined ? { gloss } : {}),
      ...(form !== undefined ? { form } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    if (!result.ok) return { ok: false, name, result: null, error: result.error };
    return { ok: true, name, result: { ...result, _readModel: readModel } };
  }
  if (name === 'query_morpheme_paradigm') {
    const pos = textArg(args, 'pos');
    const result = queryMorphemeParadigm(rows, pos !== undefined ? { pos } : {});
    if (!result.ok) return { ok: false, name, result: null, error: result.error };
    return { ok: true, name, result: { ...result, _readModel: readModel } };
  }
  const expectRaw = textArg(args, 'expect');
  const gloss = textArg(args, 'gloss');
  const pos = textArg(args, 'pos');
  const limit = limitArg(args);
  const result = findCounterexamples(rows, {
    ...(gloss !== undefined ? { gloss } : {}),
    ...(pos !== undefined ? { pos } : {}),
    expect: expectRaw === 'absent' ? 'absent' : 'present',
    ...(limit !== undefined ? { limit } : {}),
  });
  if (!result.ok) return { ok: false, name, result: null, error: result.error };
  return { ok: true, name, result: { ...result, _readModel: readModel } };
}
