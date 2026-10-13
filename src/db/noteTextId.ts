import type { JieyuDexie as JieyuDatabase } from './engine';
import type { NoteTargetType, UserNoteDocType, UserNoteDraft } from './types';

const present = (value: string | undefined): value is string => value !== undefined && value !== '';

type NoteTargetRef = { targetType: NoteTargetType; targetId: string; parentTargetId?: string };

/**
 * 按备注目标反查所属项目 | Resolve a note's owning project (textId) from its target.
 * 与 projectLocalPurge 的 NOTE_OWNER_RESOLVERS 覆盖同一组目标类型。
 */
export async function resolveNoteTextId(
  d: JieyuDatabase,
  note: NoteTargetRef,
): Promise<string | undefined> {
  switch (note.targetType) {
    case 'text':
      return note.targetId;
    case 'unit':
      return (await d.layer_units.get(note.targetId))?.textId;
    case 'translation':
      return (await d.layer_unit_contents.get(note.targetId))?.textId;
    case 'token':
      return (await d.unit_tokens.get(note.targetId))?.textId;
    case 'morpheme':
      return (await d.unit_morphemes.get(note.targetId))?.textId;
    case 'lexeme':
      return (await d.lexemes.get(note.targetId))?.textId;
    case 'sense':
      return present(note.parentTargetId)
        ? (await d.lexemes.get(note.parentTargetId))?.textId
        : undefined;
    case 'annotation':
    case 'tier_annotation': {
      const annotation = await d.tier_annotations.get(note.targetId);
      if (annotation) return (await d.tier_definitions.get(annotation.tierId))?.textId;
      // 单元格备注 'unitId::layerId[::@waveform]' | Cell notes use a composite id
      const [unitPart, layerPart] = note.targetId.split('::');
      const unitTextId = present(unitPart)
        ? (await d.layer_units.get(unitPart))?.textId
        : undefined;
      if (present(unitTextId)) return unitTextId;
      return present(layerPart) ? (await d.tier_definitions.get(layerPart))?.textId : undefined;
    }
  }
}

/** 补齐 textId；无法归属时抛错，不写孤儿备注 | Fill textId; throw rather than write an unowned note. */
export async function withNoteTextId(
  d: JieyuDatabase,
  note: UserNoteDraft,
): Promise<UserNoteDocType> {
  const textId = note.textId ?? (await resolveNoteTextId(d, note));
  if (!present(textId))
    throw new Error(`user_notes: cannot resolve textId for ${note.targetType}:${note.targetId}`);
  return { ...note, textId };
}

/**
 * 给缺 textId 的旧备注补齐（打开数据库 / 导入旧备份时）；补不上的只返回 id，由调用方记日志，不删除。
 * Backfill textId on legacy notes (DB open / legacy backup import). Unresolvable ids are returned, never deleted.
 */
export async function fillLegacyNoteTextIds(
  d: JieyuDatabase,
  notes: Array<Partial<UserNoteDocType> & NoteTargetRef>,
): Promise<{ filled: UserNoteDocType[]; unresolved: string[] }> {
  const filled: UserNoteDocType[] = [];
  const unresolved: string[] = [];
  for (const note of notes) {
    if (present(note.textId)) continue;
    const textId = await resolveNoteTextId(d, note);
    if (present(textId)) filled.push({ ...note, textId } as UserNoteDocType);
    else unresolved.push(String(note.id));
  }
  return { filled, unresolved };
}

/** 打开数据库后一次性回填 | One-time backfill after the DB opens. */
export async function backfillUserNoteTextIds(
  d: JieyuDatabase,
): Promise<{ filled: number; unresolved: string[] }> {
  const legacy = await d.user_notes.filter((note) => !present(note.textId)).toArray();
  if (legacy.length === 0) return { filled: 0, unresolved: [] };
  const { filled, unresolved } = await fillLegacyNoteTextIds(d, legacy);
  if (filled.length > 0) await d.user_notes.bulkPut(filled);
  return { filled: filled.length, unresolved };
}
