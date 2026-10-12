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
