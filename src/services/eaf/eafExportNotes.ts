import type { LayerUnitDocType, SpeakerDocType, UserNoteDocType } from '../../db';
import { formatEafSideChannelNote, parseEafSideChannelNote } from '../../utils/eafTierRole';
import { escapeXml } from './eafXml';

export function buildNoteTierXml(
  sorted: LayerUnitDocType[],
  uttSlotMap: Map<string, { tsStart: string; tsEnd: string }>,
  notes: UserNoteDocType[],
  annCounterStart: number,
  uttAnnotationIdMap: Map<string, string>,
  speakers: SpeakerDocType[],
  parentTierId: string,
): string {
  const notesByUtt = new Map<string, UserNoteDocType[]>();
  for (const note of notes) {
    if (note.targetType !== 'unit') continue;
    const arr = notesByUtt.get(note.targetId);
    if (arr) arr.push(note);
    else notesByUtt.set(note.targetId, [note]);
  }

  let counter = annCounterStart;
  const annotations = sorted
    .map((utt) => {
      const uttNotes = notesByUtt.get(utt.id) ?? [];
      const slots = uttSlotMap.get(utt.id);
      if (!slots && uttNotes.length === 0) return null;
      const speaker = speakers.find((item) => item.id === utt.speakerId);
      const dialect = speaker?.dialect?.trim();
      const parts = [
        ...uttNotes.map((note) => {
          const body = note.content['default'] ?? Object.values(note.content)[0] ?? '';
          if (parseEafSideChannelNote(body)) return body;
          const prefix = note.category ? `[${note.category}] ` : '';
          return prefix + body;
        }),
        ...(dialect ? [formatEafSideChannelNote('speaker-dialect', dialect)] : []),
      ].filter((part) => part.trim().length > 0);
      if (parts.length === 0) return null;
      const text = parts.join(' | ');
      const parentAnnId = uttAnnotationIdMap.get(utt.id);
      if (parentAnnId) {
        return `        <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="a${counter++}" ANNOTATION_REF="${escapeXml(parentAnnId)}">
                <ANNOTATION_VALUE>${escapeXml(text)}</ANNOTATION_VALUE>
            </REF_ANNOTATION>
        </ANNOTATION>`;
      }
      if (!slots) return null;
      return `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a${counter++}" TIME_SLOT_REF1="${slots.tsStart}" TIME_SLOT_REF2="${slots.tsEnd}">
                <ANNOTATION_VALUE>${escapeXml(text)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`;
    })
    .filter(Boolean);

  if (annotations.length === 0) return '';

  return `    <TIER TIER_ID="notes" LINGUISTIC_TYPE_REF="default-lt" PARENT_REF="${escapeXml(parentTierId)}" DEFAULT_LOCALE="en">
${annotations.join('\n')}
    </TIER>`;
}
