import type { UnitNote } from './useDesktopProjectReadQueries';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';

export const CERTAINTY_VALUES = [
  'not_understood',
  'uncertain',
  'certain',
] as const satisfies readonly UnitSelfCertainty[];

export type CertaintyValue = (typeof CERTAINTY_VALUES)[number];

/** Same value → that value; any mix or empty → mixed/null. */
export function sharedSelfCertainty(
  values: readonly (UnitSelfCertainty | null | undefined)[],
): { kind: 'empty' } | { kind: 'value'; value: UnitSelfCertainty | null } | { kind: 'mixed' } {
  if (values.length === 0) return { kind: 'empty' };
  const first = values[0] ?? null;
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i] ?? null) !== first) return { kind: 'mixed' };
  }
  return { kind: 'value', value: first };
}

export function noteBodyText(content: Record<string, string>): string {
  return (
    content.default?.trim() ||
    content.zh?.trim() ||
    content.en?.trim() ||
    Object.values(content)
      .find((part) => part.trim().length > 0)
      ?.trim() ||
    ''
  );
}

export type NotesDialogState =
  | null
  | {
      mode: 'list';
      unitIds: string[];
      textLayerId: string | null;
      layerName: string;
      orthographyLabel: string;
      notes: UnitNote[];
    }
  | {
      mode: 'edit' | 'add' | 'batch';
      unitIds: string[];
      textLayerId: string | null;
      layerName: string;
      orthographyLabel: string;
      noteId: string | null;
      content?: Record<string, string> | undefined;
      draft: string;
      failed: boolean;
    };

export function notesForUnits(
  notes: readonly UnitNote[],
  unitIds: readonly string[],
  textLayerId: string | null,
): UnitNote[] {
  return notes.filter(
    (note) =>
      note.unitId !== null &&
      unitIds.includes(note.unitId) &&
      (textLayerId === null
        ? (note.anchorKind ?? 'unit') === 'unit'
        : note.anchorKind === 'unit_text' && note.layerId === textLayerId),
  );
}
