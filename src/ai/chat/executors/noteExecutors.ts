/**
 * noteExecutors — Note query helpers and executors
 * Extracted from localContextToolExecutors.ts
 */

import type { AiPromptContext } from '../chatDomain.types';
import type { LocalContextToolResult } from '../localContextToolTypes';
import type { AiLocalToolReadModelMeta } from '../chatDomain.types';
import type { NoteCategory, UserNoteDocType } from '../../../db';
import { getDb } from '../../../db';
import { normalizeUnitScope } from '../localContextToolScopeNormalize';
import { buildReadModelMetaWithSource } from './readModelMeta';
import { normalizeTextValue } from './argNormalizers';
import {
  loadNormalizedUnitRows,
  filterRowsByScope,
  loadScopedSegmentMetaRows,
  mapSegmentMetaRows,
  type NormalizedUnitRow,
} from './timelineExecutors';

export function normalizeNotesDetailLimit(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(50, Math.max(1, Math.floor(value)));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(50, Math.max(1, Math.floor(parsed)));
    }
  }
  return 20;
}

export function normalizeNoteCategoryFilter(value: unknown): NoteCategory | undefined {
  if (typeof value !== 'string') return undefined;
  const n = value.trim().toLowerCase() as NoteCategory;
  const allowed: NoteCategory[] = [
    'comment',
    'question',
    'todo',
    'linguistic',
    'fieldwork',
    'correction',
  ];
  return allowed.includes(n) ? n : undefined;
}

export function firstNoteContentPreview(content: unknown, maxChars: number): string {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return '';
  const values = Object.values(content as Record<string, unknown>).filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  const raw = (values[0] ?? '').trim();
  return raw.length > maxChars ? `${raw.slice(0, maxChars)}…` : raw;
}

export function noteHostTargetId(note: UserNoteDocType): string | undefined {
  const rawValue = (note as unknown as Record<string, unknown>)[['par', 'entTargetId'].join('')];
  return typeof rawValue === 'string' && rawValue.trim().length > 0 ? rawValue : undefined;
}

export function noteMatchesTimelineScope(
  note: UserNoteDocType,
  idSet: Set<string>,
  workspaceTextId: string,
): boolean {
  const { targetType, targetId } = note;
  const hostTargetId = noteHostTargetId(note);
  if (targetType === 'text') {
    return workspaceTextId.length > 0 && targetId === workspaceTextId;
  }
  if (targetType === 'unit' || targetType === 'translation') {
    return idSet.has(targetId);
  }
  if (targetType === 'tier_annotation') {
    if (hostTargetId && idSet.has(hostTargetId)) return true;
    const sep = targetId.indexOf('::');
    const core = sep >= 0 ? targetId.slice(0, sep) : targetId;
    return idSet.has(core);
  }
  if (targetType === 'token' || targetType === 'morpheme' || targetType === 'annotation') {
    if (hostTargetId && idSet.has(hostTargetId)) return true;
    return idSet.has(targetId);
  }
  if (targetType === 'lexeme' || targetType === 'sense') {
    return idSet.has(targetId);
  }
  return false;
}

export function getSpeakerBreakdown(
  context: AiPromptContext,
  args: Record<string, unknown>,
): LocalContextToolResult {
  const scope = normalizeUnitScope(args.scope, 'current_track');
  const allRows = loadNormalizedUnitRows(context);
  if (allRows.length === 0) {
    return { ok: false, name: 'get_speaker_breakdown', result: null, error: 'data_loading' };
  }
  const scoped = filterRowsByScope(context, allRows, scope);
  const nameById = new Map(
    (context.shortTerm?.speakerIndex ?? []).map((s) => [s.id, (s.name ?? s.id).trim() || s.id]),
  );
  const UNLABELED = '__unlabeled__';
  const counts = new Map<string, number>();
  for (const row of scoped) {
    const sid = normalizeTextValue(row.speakerId);
    const key = sid.length > 0 ? sid : UNLABELED;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const breakdown = [...counts.entries()]
    .map(([speakerId, unitCount]) => {
      const unlabeled = speakerId === UNLABELED;
      return {
        ...(unlabeled ? {} : { speakerId }),
        displayName: unlabeled ? '(unlabeled)' : (nameById.get(speakerId) ?? speakerId),
        unitCount,
        ...(unlabeled ? { unlabeled: true as const } : {}),
      };
    })
    .sort((a, b) => b.unitCount - a.unitCount);

  return {
    ok: true,
    name: 'get_speaker_breakdown',
    result: {
      scope,
      totalRows: scoped.length,
      distinctLabeledSpeakers: breakdown.filter((row) => !('unlabeled' in row)).length,
      unlabeledRowCount: counts.get(UNLABELED) ?? 0,
      breakdown,
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

export async function listNotesDetail(
  context: AiPromptContext,
  args: Record<string, unknown>,
): Promise<LocalContextToolResult> {
  const scope = normalizeUnitScope(args.scope, 'current_track');
  const limit = normalizeNotesDetailLimit(args.limit);
  const categoryFilter = normalizeNoteCategoryFilter(args.category);

  const allRowsFromIndex = loadNormalizedUnitRows(context);
  let scoped: NormalizedUnitRow[];
  let readModelSource: NonNullable<AiLocalToolReadModelMeta['source']> = 'timeline_index';

  if (allRowsFromIndex.length > 0) {
    scoped = filterRowsByScope(context, allRowsFromIndex, scope);
  } else {
    const scopedSegmentMetaRows = await loadScopedSegmentMetaRows(context, scope);
    if (
      scopedSegmentMetaRows &&
      (scopedSegmentMetaRows.length > 0 || allRowsFromIndex.length === 0)
    ) {
      scoped = mapSegmentMetaRows(scopedSegmentMetaRows);
      readModelSource = 'segment_meta';
    } else {
      return { ok: false, name: 'list_notes_detail', result: null, error: 'data_loading' };
    }
  }

  const workspaceTextId = normalizeTextValue(context.shortTerm?.workspaceTextId);
  let scopedForNotes = scoped;
  if (workspaceTextId.length > 0) {
    scopedForNotes = scoped.filter((row) => {
      const tid = normalizeTextValue(row.textId);
      return tid.length === 0 || tid === workspaceTextId;
    });
  }
  const idSet = new Set(scopedForNotes.map((row) => row.id));

  let fetched: UserNoteDocType[];
  try {
    const db = await getDb();
    fetched = await db.dexie.user_notes.orderBy('updatedAt').reverse().limit(800).toArray();
  } catch {
    return { ok: false, name: 'list_notes_detail', result: null, error: 'notes_read_failed' };
  }

  const notes: Array<{
    id: string;
    targetType: string;
    targetId: string;
    hostTargetId?: string;
    category?: NoteCategory;
    updatedAt: string;
    contentPreview: string;
  }> = [];

  for (const note of fetched) {
    if (!noteMatchesTimelineScope(note, idSet, workspaceTextId)) continue;
    if (categoryFilter && (note.category ?? 'comment') !== categoryFilter) continue;
    const hostTargetId = noteHostTargetId(note);
    notes.push({
      id: note.id,
      targetType: note.targetType,
      targetId: note.targetId,
      ...(hostTargetId ? { hostTargetId } : {}),
      ...(note.category ? { category: note.category } : {}),
      updatedAt: note.updatedAt,
      contentPreview: firstNoteContentPreview(note.content, 120),
    });
    if (notes.length >= limit) break;
  }

  return {
    ok: true,
    name: 'list_notes_detail',
    result: {
      scope,
      limit,
      ...(categoryFilter ? { category: categoryFilter } : {}),
      count: notes.length,
      notes,
      _readModel: buildReadModelMetaWithSource(context, readModelSource),
    },
  };
}
