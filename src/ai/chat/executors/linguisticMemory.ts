/**
 * linguisticMemory — Unit detail and linguistic memory queries
 * Extracted from localContextToolExecutors.ts
 */

import type { AiPromptContext } from '../chatDomain.types';
import type { LocalContextToolResult } from '../localContextToolTypes';
import { dexieStoresForGetUnitLinguisticMemoryRead, getDb } from '../../../db';
import { listUnitTextsByUnit } from '../../../services/LayerSegmentationTextService';
import { getSegmentDetail } from '../../queries/segmentReadQueries';
import { normalizeUnitScope } from '../localContextToolScopeNormalize';
import { buildReadModelMetaWithSource } from './readModelMeta';
import { normalizeTextValue, normalizeBoolean } from './argNormalizers';
import {
  resolveSegmentReadQueryScope,
  loadScopedSegmentMetaRows,
  normalizedUnitRowsFromContext,
  filterRowsByScope,
} from './timelineExecutors';

export async function getUnitDetail(
  args: Record<string, unknown>,
  context: AiPromptContext,
): Promise<LocalContextToolResult> {
  const scope = normalizeUnitScope(args.scope, 'project');
  const unitId = normalizeTextValue(args.unitId);
  if (unitId.length === 0) {
    return {
      ok: false,
      name: 'get_unit_detail',
      result: null,
      error: 'unitId is required',
    };
  }

  const queryScope = resolveSegmentReadQueryScope(context, scope);
  if (queryScope) {
    try {
      const detail = await getSegmentDetail(unitId, queryScope);
      if (detail) {
        return {
          ok: true,
          name: 'get_unit_detail',
          result: {
            scope,
            id: detail.id,
            kind: detail.kind,
            layerId: detail.layerId,
            ...(detail.textId ? { textId: detail.textId } : {}),
            ...(detail.mediaId ? { mediaId: detail.mediaId } : {}),
            startTime: detail.startTime,
            endTime: detail.endTime,
            ...(detail.speakerId ? { speakerId: detail.speakerId } : {}),
            ...(detail.annotationStatus ? { annotationStatus: detail.annotationStatus } : {}),
            transcription: detail.transcription,
            ...(detail.layers ? { layers: detail.layers } : {}),
            ...(detail.annotations ? { annotations: detail.annotations } : {}),
            ...(detail.translations ? { translations: detail.translations } : {}),
            _readModel: buildReadModelMetaWithSource(context, 'segment_meta'),
          },
        };
      }
    } catch {
      // fall through to legacy local/query paths
    }
  }

  const scopedSegmentMetaRows = await loadScopedSegmentMetaRows(context, scope);
  if (scopedSegmentMetaRows) {
    const hit = scopedSegmentMetaRows.find((row) => row.segmentId === unitId || row.id === unitId);
    if (hit) {
      return {
        ok: true,
        name: 'get_unit_detail',
        result: {
          scope,
          id: hit.segmentId,
          kind: hit.unitKind ?? 'segment',
          layerId: hit.layerId,
          textId: hit.textId,
          mediaId: hit.mediaId,
          startTime: hit.startTime,
          endTime: hit.endTime,
          ...(hit.effectiveSpeakerId ? { speakerId: hit.effectiveSpeakerId } : {}),
          ...(hit.annotationStatus ? { annotationStatus: hit.annotationStatus } : {}),
          transcription: hit.text,
          _readModel: buildReadModelMetaWithSource(context, 'segment_meta'),
        },
      };
    }
  }

  const localRows = normalizedUnitRowsFromContext(context);
  if (localRows) {
    const scopedRows = filterRowsByScope(context, localRows, scope);
    const hit = scopedRows.find((r) => r.id === unitId);
    if (hit) {
      return {
        ok: true,
        name: 'get_unit_detail',
        result: {
          scope,
          id: hit.id,
          kind: hit.kind,
          layerId: hit.layerId,
          textId: hit.textId,
          mediaId: hit.mediaId,
          startTime: hit.startTime,
          endTime: hit.endTime,
          speakerId: hit.speakerId,
          annotationStatus: hit.annotationStatus,
          transcription: hit.transcription,
        },
      };
    }
    if (scope !== 'project' && localRows.some((row) => row.id === unitId)) {
      return {
        ok: false,
        name: 'get_unit_detail',
        result: null,
        error: `unit not found in scope: ${scope}`,
      };
    }
  }
  return { ok: false, name: 'get_unit_detail', result: null, error: `unit not found: ${unitId}` };
}

type LinguisticMemoryNoteTargetType = 'unit' | 'translation' | 'token' | 'morpheme';

interface LinguisticMemoryNoteView {
  id: string;
  category?: string;
  content: Record<string, string>;
  updatedAt: string;
}

interface LinguisticMemoryLayerRow {
  id: string;
  layerType?: unknown;
  contentType?: unknown;
}

function mapLayerType(value: unknown): 'transcription' | 'translation' | 'unknown' {
  if (value === 'transcription' || value === 'translation') return value;
  return 'unknown';
}

function mapLinguisticMemoryNoteRows(
  rows: Array<Record<string, unknown>>,
): LinguisticMemoryNoteView[] {
  return rows
    .map((row) => {
      const content = row.content;
      if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
      return {
        id: String(row.id ?? ''),
        ...(typeof row.category === 'string' ? { category: row.category } : {}),
        content: content as Record<string, string>,
        updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
      };
    })
    .filter((row): row is LinguisticMemoryNoteView => row !== null)
    .sort((a, b) => {
      if (a.updatedAt === b.updatedAt) return a.id.localeCompare(b.id);
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
}

async function listNotesByTarget(
  db: Awaited<ReturnType<typeof getDb>>,
  targetType: LinguisticMemoryNoteTargetType,
  targetId: string,
): Promise<LinguisticMemoryNoteView[]> {
  if (targetId.trim().length === 0) return [];
  const rows = await db.dexie.user_notes
    .where('[targetType+targetId]')
    .equals([targetType, targetId])
    .toArray();
  return mapLinguisticMemoryNoteRows(rows as unknown as Array<Record<string, unknown>>);
}

export async function getUnitLinguisticMemory(
  args: Record<string, unknown>,
  context: AiPromptContext,
): Promise<LocalContextToolResult> {
  const scope = normalizeUnitScope(args.scope, 'project');
  const unitId = normalizeTextValue(args.unitId);
  if (unitId.length === 0) {
    return {
      ok: false,
      name: 'get_unit_linguistic_memory',
      result: null,
      error: 'unitId is required',
    };
  }

  const includeNotes = normalizeBoolean(args.includeNotes, true);
  const includeMorphemes = normalizeBoolean(args.includeMorphemes, true);
  const localRows = normalizedUnitRowsFromContext(context);
  const scopedRows = localRows ? filterRowsByScope(context, localRows, scope) : null;
  if (
    scope !== 'project' &&
    localRows &&
    scopedRows &&
    !scopedRows.some((row) => row.id === unitId)
  ) {
    return {
      ok: false,
      name: 'get_unit_linguistic_memory',
      result: null,
      error: `unit not found in scope: ${scope}`,
    };
  }
  const localHit = localRows?.find((row) => row.id === unitId);

  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch {
    return {
      ok: false,
      name: 'get_unit_linguistic_memory',
      result: null,
      error: 'database_unavailable',
    };
  }

  const {
    layerUnit,
    unitTexts,
    tokenRowsRaw,
    morphemeRowsRaw,
    layerRows,
    unitNotes,
    translationNoteRows,
    tokenNoteRows,
    morphemeNoteRows,
  } = await db.dexie.transaction(
    'r',
    [...dexieStoresForGetUnitLinguisticMemoryRead(db)],
    async () => {
      const [layerUnit, unitTexts, tokenRowsRaw, morphemeRowsRaw] = await Promise.all([
        db.dexie.layer_units.get(unitId),
        listUnitTextsByUnit(db, unitId),
        db.dexie.unit_tokens.where('unitId').equals(unitId).toArray(),
        includeMorphemes
          ? db.dexie.unit_morphemes.where('unitId').equals(unitId).toArray()
          : Promise.resolve([]),
      ]);

      const layerIds = [
        ...new Set(
          unitTexts
            .map((row) => row.layerId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      ];

      const [layerRows, unitNotes, translationNoteRows, tokenNoteRows, morphemeNoteRows]: [
        LinguisticMemoryLayerRow[],
        LinguisticMemoryNoteView[],
        Array<{ textId: string; notes: LinguisticMemoryNoteView[] }>,
        Array<{ tokenId: string; notes: LinguisticMemoryNoteView[] }>,
        Array<{ morphemeId: string; notes: LinguisticMemoryNoteView[] }>,
      ] = await Promise.all([
        layerIds.length > 0
          ? (db.dexie.tier_definitions.where('id').anyOf(layerIds).toArray() as Promise<
              LinguisticMemoryLayerRow[]
            >)
          : Promise.resolve<LinguisticMemoryLayerRow[]>([]),
        includeNotes
          ? listNotesByTarget(db, 'unit', unitId)
          : Promise.resolve<LinguisticMemoryNoteView[]>([]),
        includeNotes
          ? Promise.all(
              unitTexts.map(async (row) => ({
                textId: row.id,
                notes: await listNotesByTarget(db, 'translation', row.id),
              })),
            )
          : Promise.resolve<Array<{ textId: string; notes: LinguisticMemoryNoteView[] }>>([]),
        includeNotes
          ? Promise.all(
              tokenRowsRaw.map(async (row) => ({
                tokenId: row.id,
                notes: await listNotesByTarget(db, 'token', row.id),
              })),
            )
          : Promise.resolve<Array<{ tokenId: string; notes: LinguisticMemoryNoteView[] }>>([]),
        includeNotes
          ? Promise.all(
              morphemeRowsRaw.map(async (row) => ({
                morphemeId: row.id,
                notes: await listNotesByTarget(db, 'morpheme', row.id),
              })),
            )
          : Promise.resolve<Array<{ morphemeId: string; notes: LinguisticMemoryNoteView[] }>>([]),
      ]);

      return {
        layerUnit,
        unitTexts,
        tokenRowsRaw,
        morphemeRowsRaw,
        layerRows,
        unitNotes,
        translationNoteRows,
        tokenNoteRows,
        morphemeNoteRows,
      };
    },
  );

  const hasAnyData = Boolean(
    localHit ||
    layerUnit ||
    unitTexts.length > 0 ||
    tokenRowsRaw.length > 0 ||
    morphemeRowsRaw.length > 0,
  );
  if (!hasAnyData) {
    return {
      ok: false,
      name: 'get_unit_linguistic_memory',
      result: null,
      error: `unit not found: ${unitId}`,
    };
  }

  const tokenRows = [...tokenRowsRaw].sort((a, b) => a.tokenIndex - b.tokenIndex);
  const morphemeRows = [...morphemeRowsRaw].sort((a, b) => {
    if (a.tokenId === b.tokenId) return a.morphemeIndex - b.morphemeIndex;
    return a.tokenId.localeCompare(b.tokenId);
  });

  const layerTypeById = new Map(
    layerRows.map((layer) => [layer.id, mapLayerType(layer.layerType ?? layer.contentType)]),
  );

  const translationNotesByTextId = new Map(
    translationNoteRows.map((entry) => [entry.textId, entry.notes]),
  );

  const tokenNotesById = new Map(tokenNoteRows.map((entry) => [entry.tokenId, entry.notes]));

  const morphemeNotesById = new Map(
    morphemeNoteRows.map((entry) => [entry.morphemeId, entry.notes]),
  );

  const morphemesByTokenId = new Map<string, Array<Record<string, unknown>>>();
  if (includeMorphemes) {
    for (const row of morphemeRows) {
      const list = morphemesByTokenId.get(row.tokenId) ?? [];
      list.push({
        id: row.id,
        morphemeIndex: row.morphemeIndex,
        form: row.form,
        ...(row.gloss !== undefined ? { gloss: row.gloss } : {}),
        ...(row.pos !== undefined ? { pos: row.pos } : {}),
        ...(row.lexemeId !== undefined ? { lexemeId: row.lexemeId } : {}),
        ...(includeNotes ? { notes: morphemeNotesById.get(row.id) ?? [] } : {}),
      });
      morphemesByTokenId.set(row.tokenId, list);
    }
  }

  const tokens = tokenRows.map((row) => ({
    id: row.id,
    tokenIndex: row.tokenIndex,
    form: row.form,
    ...(row.gloss !== undefined ? { gloss: row.gloss } : {}),
    ...(row.pos !== undefined ? { pos: row.pos } : {}),
    ...(row.lexemeId !== undefined ? { lexemeId: row.lexemeId } : {}),
    ...(includeNotes ? { notes: tokenNotesById.get(row.id) ?? [] } : {}),
    ...(includeMorphemes ? { morphemes: morphemesByTokenId.get(row.id) ?? [] } : {}),
  }));

  const layerTexts = unitTexts.map((row) => {
    const layerId = row.layerId ?? '';
    const layerType = layerTypeById.get(layerId) ?? 'unknown';
    return {
      id: row.id,
      layerId,
      layerType,
      ...(row.text !== undefined ? { text: row.text } : {}),
      modality: row.modality,
      sourceType: row.sourceType,
      updatedAt: row.updatedAt,
      ...(includeNotes ? { notes: translationNotesByTextId.get(row.id) ?? [] } : {}),
    };
  });

  const transcriptions = layerTexts.filter((row) => row.layerType === 'transcription');
  const translations = layerTexts.filter((row) => row.layerType === 'translation');
  const fallbackTranscription = transcriptions.find(
    (row) => typeof row.text === 'string' && row.text.trim().length > 0,
  )?.text;

  const tokenWithPosCount = tokens.filter(
    (row) => typeof row.pos === 'string' && row.pos.trim().length > 0,
  ).length;
  const tokenWithGlossCount = tokens.filter((row) => row.gloss !== undefined).length;
  const morphemeWithPosCount = includeMorphemes
    ? morphemeRows.filter((row) => typeof row.pos === 'string' && row.pos.trim().length > 0).length
    : 0;
  const morphemeWithGlossCount = includeMorphemes
    ? morphemeRows.filter((row) => row.gloss !== undefined).length
    : 0;

  return {
    ok: true,
    name: 'get_unit_linguistic_memory',
    result: {
      unit: {
        id: unitId,
        ...(localHit?.kind !== undefined
          ? { kind: localHit.kind }
          : layerUnit?.unitType !== undefined
            ? { kind: layerUnit.unitType }
            : {}),
        ...(localHit?.layerId !== undefined
          ? { layerId: localHit.layerId }
          : layerUnit?.layerId !== undefined
            ? { layerId: layerUnit.layerId }
            : {}),
        ...(localHit?.textId !== undefined
          ? { textId: localHit.textId }
          : layerUnit?.textId !== undefined
            ? { textId: layerUnit.textId }
            : {}),
        ...(localHit?.mediaId !== undefined
          ? { mediaId: localHit.mediaId }
          : layerUnit?.mediaId !== undefined
            ? { mediaId: layerUnit.mediaId }
            : {}),
        ...(localHit?.startTime !== undefined
          ? { startTime: localHit.startTime }
          : layerUnit?.startTime !== undefined
            ? { startTime: layerUnit.startTime }
            : {}),
        ...(localHit?.endTime !== undefined
          ? { endTime: localHit.endTime }
          : layerUnit?.endTime !== undefined
            ? { endTime: layerUnit.endTime }
            : {}),
        transcription: localHit?.transcription ?? fallbackTranscription ?? '',
        ...(localHit?.speakerId !== undefined ? { speakerId: localHit.speakerId } : {}),
        ...(localHit?.annotationStatus !== undefined
          ? { annotationStatus: localHit.annotationStatus }
          : {}),
        ...(includeNotes ? { notes: unitNotes } : {}),
      },
      sentence: {
        primaryTranscription: localHit?.transcription ?? fallbackTranscription ?? '',
        transcriptions,
        translations,
        layerTexts,
      },
      tokens,
      coverage: {
        translationCount: translations.length,
        tokenCount: tokens.length,
        tokenWithPosCount,
        tokenWithGlossCount,
        ...(includeMorphemes
          ? {
              morphemeCount: morphemeRows.length,
              morphemeWithPosCount,
              morphemeWithGlossCount,
            }
          : {}),
      },
      options: {
        scope,
        includeNotes,
        includeMorphemes,
      },
    },
  };
}
